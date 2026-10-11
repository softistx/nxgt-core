import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeEntry } from './cache';
import { main } from './cli';
import {
	callsOf,
	harness,
	makeApp,
	removeTempDirs,
	report,
} from './cli.fixtures';
import { EXIT } from './cli-context';
import { fileCommand } from './file';
import { trackCommand } from './track';

afterAll(removeTempDirs);

const creates = (h: ReturnType<typeof harness>) =>
	callsOf(h.runner, 'gh', 'issue', 'create');

describe('file refuses while no application domain is declared', () => {
	test('no .nxgt-issues.json: exit 3, nothing filed', async () => {
		const app = makeApp();
		rmSync(join(app, '.nxgt-issues.json'));
		const h = harness({ cwd: app, stdin: report() });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		expect(h.out.join('\n')).toContain('appDomains');
		expect(creates(h)).toEqual([]);
	});

	test('a file without appDomains refuses too', async () => {
		const app = makeApp();
		writeFileSync(
			join(app, '.nxgt-issues.json'),
			JSON.stringify({ denyTerms: ['x'] }),
		);
		const h = harness({ cwd: app, stdin: report() });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
	});

	test('an explicit appDomains: [] files', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
	});

	test('domains from the environment file', async () => {
		const app = makeApp();
		rmSync(join(app, '.nxgt-issues.json'));
		const h = harness({
			cwd: app,
			stdin: report(),
			env: { NXGT_ISSUES_APP_DOMAINS: 'acme.io' },
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
	});

	test('deps --file refuses the same way', async () => {
		const app = makeApp();
		rmSync(join(app, '.nxgt-issues.json'));
		const h = harness({
			cwd: app,
			fetch: [
				{
					url: '/@nxgt%2Fwidget/latest',
					json: {
						version: '1.4.0',
						repository: 'github:softistx/nxgt-widget',
						dependencies: { zod: '^3.0.0' },
					},
				},
				{ url: '/zod/latest', json: { version: '4.0.0' } },
			],
		});
		expect(await main(h.ctx, ['deps', '@nxgt/widget', '--file'])).toBe(
			EXIT.refusedScrub,
		);
		expect(creates(h)).toEqual([]);
	});
});

describe("the application's visibility is read fresh", () => {
	const seedPrivate = (home: string, now: number) =>
		writeEntry(
			join(home, 'cache', 'gate', 'softistx__acme-store.json'),
			{
				fullName: 'softistx/acme-store',
				hasIssues: true,
				archived: false,
				private: true,
			},
			now,
		);
	const nowPublic = {
		argv: ['gh', 'api', 'repos/softistx/acme-store'],
		result: {
			stdout: JSON.stringify({
				full_name: 'softistx/acme-store',
				has_issues: true,
				archived: false,
				private: false,
			}),
		},
	};

	test('file: a cached "private" does not hide a repository made public since', async () => {
		const h = harness({ cwd: makeApp(), stdin: report(), run: [nowPublic] });
		seedPrivate(h.home, h.ctx.now());
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedGate);
		expect(
			callsOf(h.runner, 'gh', 'api', 'repos/softistx/acme-store'),
		).toHaveLength(1);
		expect(creates(h)).toEqual([]);
	});

	test('track: the same', async () => {
		const stdin = JSON.stringify({
			upstream: 'softistx/nxgt-widget#12',
			package: '@nxgt/widget',
			title: 't',
			summary: 's',
			markers: [],
		});
		const h = harness({ cwd: makeApp(), stdin, run: [nowPublic] });
		seedPrivate(h.home, h.ctx.now());
		expect(await trackCommand(h.ctx)).toBe(EXIT.refusedGate);
		expect(creates(h)).toEqual([]);
	});

	test('the package repository stays cached', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		await fileCommand(h.ctx, {});
		await fileCommand({ ...h.ctx }, {});
		expect(
			callsOf(h.runner, 'gh', 'api', 'repos/softistx/nxgt-widget'),
		).toHaveLength(1);
		expect(
			callsOf(h.runner, 'gh', 'api', 'repos/softistx/acme-store'),
		).toHaveLength(2);
	});
});

describe('deps --file from a public application', () => {
	const publicApp = {
		argv: ['gh', 'api', 'repos/softistx/acme-store'],
		result: {
			stdout: JSON.stringify({
				full_name: 'softistx/acme-store',
				has_issues: true,
				archived: false,
				private: false,
			}),
		},
	};
	const registry = [
		{
			url: '/@nxgt%2Fwidget/latest',
			json: {
				version: '1.4.0',
				repository: 'github:softistx/nxgt-widget',
				dependencies: { zod: '^3.0.0' },
			},
		},
		{ url: '/zod/latest', json: { version: '4.0.0' } },
	];

	test('refuses with exit 2, nothing filed', async () => {
		const h = harness({ cwd: makeApp(), run: [publicApp], fetch: registry });
		expect(await main(h.ctx, ['deps', '@nxgt/widget', '--file'])).toBe(
			EXIT.refusedGate,
		);
		expect(h.out.join('\n')).toContain('softistx/acme-store is public');
		expect(creates(h)).toEqual([]);
	});

	test('--public-app files once the user agreed', async () => {
		const h = harness({ cwd: makeApp(), run: [publicApp], fetch: registry });
		expect(
			await main(h.ctx, ['deps', '@nxgt/widget', '--file', '--public-app']),
		).toBe(EXIT.ok);
		expect(creates(h)).toHaveLength(1);
	});

	test('deps without --file only reads', async () => {
		const h = harness({ cwd: makeApp(), run: [publicApp], fetch: registry });
		expect(await main(h.ctx, ['deps', '@nxgt/widget'])).toBe(EXIT.ok);
	});
});
