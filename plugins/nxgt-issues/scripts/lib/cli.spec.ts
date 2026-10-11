import { afterAll, describe, expect, test } from 'bun:test';
import { main } from './cli';
import {
	callsOf,
	harness,
	makeApp,
	removeTempDirs,
	report,
} from './cli.fixtures';

afterAll(removeTempDirs);

import { EXIT } from './cli-context';

describe('issues.ts', () => {
	test.each([
		[[]],
		[['nope']],
		[['resolve']],
		[['deps']],
		[['file', '--duplicate-of', 'x']],
		[['file', '--duplicate-of', '3', '--new']],
	])('%p prints the usage', async (argv) => {
		const h = harness({ cwd: makeApp() });
		expect(await main(h.ctx, argv)).toBe(EXIT.usage);
		expect(h.err.join('\n')).toContain('usage: issues.ts');
		expect(h.runner.calls).toEqual([]);
	});

	test('resolve prints the repository and versions', async () => {
		const h = harness({ cwd: makeApp() });
		expect(await main(h.ctx, ['resolve', '@nxgt/widget'])).toBe(EXIT.ok);
		expect(h.out).toEqual([
			'@nxgt/widget -> softistx/nxgt-widget (public, installed 1.3.0, latest 1.4.0)',
		]);
	});

	test('resolve --json prints a refusal with exit 2', async () => {
		const h = harness({
			cwd: makeApp(),
			fetch: [{ url: '/x/', json: { repository: 'github:other/x' } }],
		});
		expect(await main(h.ctx, ['resolve', 'x', '--json'])).toBe(
			EXIT.refusedGate,
		);
		expect(JSON.parse(h.out.join('\n')).reason).toBe('not-owner');
	});

	test('file passes --duplicate-of through', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		expect(await main(h.ctx, ['file', '--duplicate-of', '9'])).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'comment', '9')).toHaveLength(1);
	});

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

	test('deps prints the rows behind', async () => {
		const h = harness({ cwd: makeApp(), fetch: registry });
		expect(await main(h.ctx, ['deps', '@nxgt/widget'])).toBe(EXIT.ok);
		expect(JSON.parse(h.out.join('\n'))).toEqual([
			{ name: 'zod', current: '^3.0.0', latest: '4.0.0' },
		]);
		expect(callsOf(h.runner, 'gh', 'issue')).toEqual([]);
	});

	test('deps --file updates the rolling issue', async () => {
		const h = harness({ cwd: makeApp(), fetch: registry });
		expect(await main(h.ctx, ['deps', '@nxgt/widget', '--file'])).toBe(EXIT.ok);
		expect(h.out[0]).toMatch(/^filed /);
	});

	test('deps --file with nothing behind writes nothing', async () => {
		const h = harness({ cwd: makeApp() });
		expect(await main(h.ctx, ['deps', '@nxgt/widget', '--file'])).toBe(EXIT.ok);
		expect(h.out[0]).toMatch(/^nothing behind/);
		expect(callsOf(h.runner, 'gh', 'issue')).toEqual([]);
	});

	test('sessions and track are wired', async () => {
		const h = harness({ cwd: makeApp(), stdin: 'x' });
		expect(await main(h.ctx, ['sessions', 'softistx/nxgt-widget'])).toBe(
			EXIT.ok,
		);
		expect(await main(h.ctx, ['track'])).toBe(EXIT.usage);
	});
});
