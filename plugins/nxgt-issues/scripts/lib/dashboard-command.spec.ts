import { afterAll, describe, expect, test } from 'bun:test';
import { main } from './cli';
import { callsOf, harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import type { RunRule } from './runner.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const repo = (nameWithOwner: string) => ({ nameWithOwner });
const row = (
	name: string,
	number: number,
	over: Record<string, unknown> = {},
) => ({
	number,
	title: `t${number}`,
	labels: [],
	createdAt: day(10),
	updatedAt: day(1),
	repository: repo(name),
	...over,
});
const SEARCH = ['gh', 'search', 'issues'];
const has =
	(...words: string[]) =>
	(argv: readonly string[]) =>
		words.every((word) => argv.includes(word));

const OPEN: RunRule = {
	argv: SEARCH,
	when: (argv) => has('open')(argv) && !argv.includes('upstream'),
	result: {
		stdout: JSON.stringify([
			row('softistx/zorblax-core', 1, { createdAt: day(40) }),
			row('softistx/zorblax-core', 2, {
				labels: [{ name: 'consumer-report' }],
				updatedAt: day(30),
			}),
			row('softistx/zorblax-core', 3, { labels: [{ name: 'upstream' }] }),
			row('SteveGT96/vexora-ui', 4),
			row('stranger/quillon', 5),
			row('softistx/old-thing', 6, {
				repository: { nameWithOwner: 'softistx/old-thing', isArchived: true },
			}),
		]),
	},
};
const TRACKING: RunRule = {
	argv: SEARCH,
	when: has('upstream'),
	result: {
		stdout: JSON.stringify([
			row('softistx/acme-store', 3, {
				body: '<!-- nxgt-issues:upstream=softistx/zorblax-core#1 -->',
			}),
		]),
	},
};
const AWAITING: RunRule = {
	argv: SEARCH,
	when: has('closed'),
	result: {
		stdout: JSON.stringify([
			row('softistx/zorblax-core', 8, { closedAt: day(3) }),
		]),
	},
};
const GRAPHQL: RunRule = {
	argv: ['gh', 'api', 'graphql'],
	result: {
		stdout: JSON.stringify({
			data: {
				r0: {
					issue: {
						comments: {
							nodes: [
								{ body: 'Another consumer hit this.' },
								{ body: 'thanks' },
							],
						},
					},
				},
			},
		}),
	},
};
const PACKAGES: RunRule[] = [
	{
		argv: ['gh', 'api'],
		when: (argv) =>
			argv.includes('repos/softistx/zorblax-core/contents/package.json'),
		result: { stdout: JSON.stringify({ name: '@zorblax/core' }) },
	},
	{
		argv: ['gh', 'api'],
		when: (argv) => argv.some((a) => a.endsWith('/contents/packages')),
		result: { code: 1, stderr: 'HTTP 404: Not Found' },
	},
	{
		argv: ['gh', 'api'],
		when: (argv) =>
			argv.some((a) => a.endsWith('vexora-ui/contents/package.json')),
		result: { stdout: JSON.stringify({ name: '@vexora/ui' }) },
	},
];
const NOT_FOUND: RunRule = {
	argv: ['gh', 'api'],
	when: (argv) => argv.some((a) => a.includes('/contents/')),
	result: { code: 1, stderr: 'HTTP 404: Not Found' },
};
const RULES = [OPEN, TRACKING, AWAITING, GRAPHQL, ...PACKAGES, NOT_FOUND];

describe('dashboard', () => {
	test('ranks, hides archived and foreign repositories, lists the awaiting fixes', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		const text = h.out.join('\n');
		expect(text).toContain('@zorblax/core (softistx/zorblax-core)');
		expect(text).toContain('@vexora/ui (SteveGT96/vexora-ui)');
		expect(text).not.toContain('quillon');
		expect(text).not.toContain('old-thing');
		// 1 waits on a tracking issue (live), 2 has two reporters; 3 is a tracking issue.
		const lines = h.out.filter((l) => l.startsWith('- #'));
		expect(lines[0]).toStartWith('- #1 ● t1');
		expect(lines[1]).toContain('#2 ⚑ [consumer-report]');
		expect(lines[1]).toContain('2 affected');
		expect(text).toContain('softistx/zorblax-core#8 t8 (closed 3d ago)');
	});

	test('stays within three searches and one GraphQL call; --json parses', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		expect(await main(h.ctx, ['dashboard', '--json'])).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'search')).toHaveLength(3);
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toHaveLength(1);
		const search = callsOf(h.runner, 'gh', 'search')[0]?.argv ?? [];
		expect(search).toContain('--archived=false');
		expect(search.filter((a) => a === '--owner')).toHaveLength(2);
		const board = JSON.parse(h.out.join('\n'));
		expect(board.groups).toHaveLength(2);
		expect(board.awaiting).toHaveLength(1);
	});

	test('owners come from NXGT_ISSUES_OWNERS', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: RULES,
			env: { NXGT_ISSUES_OWNERS: 'stranger' },
		});
		await main(h.ctx, ['dashboard']);
		const argv = callsOf(h.runner, 'gh', 'search')[0]?.argv ?? [];
		expect(
			argv.slice(argv.indexOf('--owner'), argv.indexOf('--owner') + 2),
		).toEqual(['--owner', 'stranger']);
		expect(h.out.join('\n')).toContain('stranger/quillon');
	});

	test('the package map is cached for 24 hours', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		await main(h.ctx, ['dashboard']);
		const first = callsOf(h.runner, 'gh', 'api').filter((c) =>
			c.argv.some((a) => a.includes('/contents/')),
		).length;
		expect(first).toBeGreaterThan(0);
		await main(h.ctx, ['dashboard']);
		const second = callsOf(h.runner, 'gh', 'api').filter((c) =>
			c.argv.some((a) => a.includes('/contents/')),
		).length;
		expect(second).toBe(first);
	});

	test('a rate limit exits 5 and pauses; the next run spawns nothing', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: SEARCH,
					result: { code: 1, stderr: 'HTTP 429: API rate limit exceeded' },
				},
			],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.rateLimited);
		const calls = h.runner.calls.length;
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.rateLimited);
		expect(h.runner.calls.length).toBe(calls);
	});

	test('any other gh failure exits 6', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [{ argv: SEARCH, result: { code: 1, stderr: 'boom' } }],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('boom');
	});

	test('a failed duplicate-count call degrades with a warning', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{ argv: ['gh', 'api', 'graphql'], result: { code: 1, stderr: 'oops' } },
				...RULES,
			],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		expect(h.err.join('\n')).toContain('duplicate counts unavailable');
	});
});
