import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEntry } from './cache';
import {
	callsOf,
	harness,
	makeApp,
	removeTempDirs,
	report,
} from './cli.fixtures';
import { EXIT } from './cli-context';
import {
	DenyListIncomplete,
	filingDenyList,
	PRIVATE_REPOS_TTL_MS,
} from './deny-sources';
import { fileCommand } from './file';
import { findDenied } from './scrub/deny';
import { tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const list = (owner: string, names: string[]) => ({
	argv: ['gh', 'repo', 'list', owner],
	result: {
		stdout: JSON.stringify(
			names.map((name) => ({ nameWithOwner: `${owner}/${name}` })),
		),
	},
});
const orgs = (...logins: string[]) => ({
	argv: ['gh', 'api', 'user/orgs'],
	result: { stdout: logins.join('\n') },
});
const privateCache = (home: string) =>
	readEntry<Record<string, string[]>>(
		join(home, 'cache', 'private-repos.json'),
		NOW,
		PRIVATE_REPOS_TTL_MS,
	);

describe('an empty private list is never accepted', () => {
	test('every owner returning nothing refuses and caches nothing', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [list('softistx', []), list('SteveGT96', [])],
		});
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
		expect(privateCache(h.home)).toBeUndefined();
	});

	test('an owner dropping to 0 when the cache held entries refuses and keeps the cache', async () => {
		const cwd = makeApp();
		const first = harness({ cwd, now: NOW });
		await filingDenyList(first.ctx);
		const later = harness({
			cwd,
			now: NOW + PRIVATE_REPOS_TTL_MS + 1,
			run: [list('softistx', [])],
		});
		const ctx = { ...later.ctx, home: first.home };
		await expect(filingDenyList(ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
		expect(privateCache(first.home)?.data['softistx']).toEqual([
			'softistx/secret-crm',
		]);
	});

	test('a refusal exits like the other deny-list refusals', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			stdin: report(),
			run: [list('softistx', []), list('SteveGT96', [])],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		expect(h.err.join('\n')).toContain('nothing was filed');
	});
});

describe('a cached answer must be whole too', () => {
	const seed = (home: string, data: unknown, writtenAt: number) => {
		mkdirSync(join(home, 'cache'), { recursive: true });
		writeFileSync(
			join(home, 'cache', 'private-repos.json'),
			JSON.stringify({ writtenAt, data }),
		);
	};

	test('an empty fresh cache is refetched, and refuses when gh is empty too', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [list('softistx', []), list('SteveGT96', [])],
		});
		seed(h.home, { softistx: [], SteveGT96: [] }, NOW);
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
		expect(callsOf(h.runner, 'gh', 'repo', 'list')).not.toEqual([]);
	});

	test('an empty 3-day-old cache with gh down refuses', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: ['gh', 'repo', 'list'],
					result: { code: 1, stderr: 'offline' },
				},
			],
		});
		seed(h.home, { softistx: [], SteveGT96: [] }, NOW - 3 * DAY);
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});

describe('the stale private list', () => {
	const failing = {
		argv: ['gh', 'repo', 'list'],
		result: { code: 1, stderr: 'offline' },
	};

	test('is used for up to 7 days, then refuses', async () => {
		const cwd = makeApp();
		const ok = harness({ cwd, now: NOW });
		await filingDenyList(ok.ctx);
		const at = (days: number) => {
			const h = harness({ cwd, now: NOW + days * DAY, run: [failing] });
			return { ...h.ctx, home: ok.home };
		};
		expect(findDenied('secret-crm', await filingDenyList(at(6)))).toEqual([
			'secret-crm',
		]);
		await expect(filingDenyList(at(8))).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});

describe("the token's organisations", () => {
	test('their private repositories are denied, and are not filing owners', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [orgs('acme-guild'), list('acme-guild', ['quillon-vault'])],
		});
		const denied = await filingDenyList(h.ctx);
		expect(findDenied('the quillon-vault repo', denied)).toContain(
			'quillon-vault',
		);
		expect(callsOf(h.runner, 'gh', 'api', 'user/orgs')).toHaveLength(1);
		expect(callsOf(h.runner, 'gh', 'api', 'user/orgs')[0]?.argv).toContain(
			'--paginate',
		);
	});

	test('the list is cached like the private list', async () => {
		const cwd = makeApp();
		const first = harness({
			cwd,
			now: NOW,
			run: [orgs('acme-guild'), list('acme-guild', ['quillon-vault'])],
		});
		await filingDenyList(first.ctx);
		const second = harness({ cwd, now: NOW + 1000 });
		await filingDenyList({ ...second.ctx, home: first.home });
		expect(callsOf(second.runner, 'gh', 'api', 'user/orgs')).toEqual([]);
		expect(callsOf(second.runner, 'gh', 'repo', 'list')).toEqual([]);
	});

	test('a failure falls back to the cache, else refuses', async () => {
		const cwd = makeApp();
		const ok = harness({
			cwd,
			now: NOW,
			run: [orgs('acme-guild'), list('acme-guild', ['quillon-vault'])],
		});
		await filingDenyList(ok.ctx);
		const down = {
			argv: ['gh', 'api', 'user/orgs'],
			result: { code: 1, stderr: 'offline' },
		};
		const stale = harness({
			cwd,
			now: NOW + 2 * PRIVATE_REPOS_TTL_MS,
			run: [down],
		});
		const denied = await filingDenyList({ ...stale.ctx, home: ok.home });
		expect(findDenied('quillon-vault', denied)).toContain('quillon-vault');
		const cold = harness({ cwd, now: NOW, run: [down] });
		await expect(filingDenyList(cold.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});

describe('an empty organisation answer', () => {
	test('refuses when the cache had organisations', async () => {
		const cwd = makeApp();
		const first = harness({
			cwd,
			now: NOW,
			run: [orgs('acme-guild'), list('acme-guild', ['quillon-vault'])],
		});
		await filingDenyList(first.ctx);
		const later = harness({
			cwd,
			now: NOW + PRIVATE_REPOS_TTL_MS + 1,
			run: [orgs()],
		});
		await expect(
			filingDenyList({ ...later.ctx, home: first.home }),
		).rejects.toBeInstanceOf(DenyListIncomplete);
	});

	test('NXGT_ISSUES_DENY_SKIP_ORGS leaves an organisation out', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			env: { NXGT_ISSUES_DENY_SKIP_ORGS: 'saml-org' },
			run: [
				orgs('acme-guild', 'saml-org'),
				list('acme-guild', ['quillon-vault']),
			],
		});
		await filingDenyList(h.ctx);
		expect(
			callsOf(h.runner, 'gh', 'repo', 'list').map((c) => c.argv[3]),
		).not.toContain('saml-org');
	});
});

describe('NXGT_ISSUES_DENY_OWNERS', () => {
	test('adds owners to the deny-list only, not to the filing owners', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			env: { NXGT_ISSUES_DENY_OWNERS: 'vexora-labs, acme-guild' },
			run: [
				list('vexora-labs', ['zorblax-vault']),
				{
					argv: ['gh', 'repo', 'list', 'acme-guild'],
					result: { stdout: '[]' },
				},
			],
		});
		const denied = await filingDenyList(h.ctx);
		expect(findDenied('zorblax-vault', denied)).toContain('zorblax-vault');
		expect(
			callsOf(h.runner, 'gh', 'repo', 'list')
				.map((c) => c.argv[3])
				.sort(),
		).toEqual(['SteveGT96', 'acme-guild', 'softistx', 'vexora-labs']);
	});
});

describe('a filing needs a git root', () => {
	test('a working directory outside any checkout refuses', async () => {
		const h = harness({
			cwd: tempDir('norepo'),
			now: NOW,
			env: { NXGT_ISSUES_APP_DOMAINS: 'app.acme.io' },
		});
		await expect(filingDenyList(h.ctx)).rejects.toBeInstanceOf(
			DenyListIncomplete,
		);
	});
});
