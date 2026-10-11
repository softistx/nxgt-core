import { afterAll, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './cli';
import {
	callsOf,
	harness,
	makeApp,
	PKG,
	removeTempDirs,
	report,
} from './cli.fixtures';

afterAll(removeTempDirs);

import { EXIT } from './cli-context';
import { fileCommand, searchQuery } from './file';
import { fingerprint, fingerprintMarker } from './fingerprint';

const appRepo = (over: Record<string, unknown>) => ({
	argv: ['gh', 'api', 'repos/softistx/acme-store'],
	result: {
		stdout: JSON.stringify({
			full_name: 'softistx/acme-store',
			has_issues: true,
			archived: false,
			private: true,
			...over,
		}),
	},
});
const writes = (h: ReturnType<typeof harness>) =>
	h.runner.calls.filter((c) => c.argv[0] === 'gh' && c.argv[1] === 'issue');

describe('file from a public application', () => {
	test('refused without --public-app, nothing listed or written', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [appRepo({ private: false })],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedGate);
		expect(h.out.join('\n')).toContain('softistx/acme-store is public');
		expect(h.out.join('\n')).toContain('--public-app');
		expect(writes(h)).toEqual([]);
	});

	test('--public-app files once the user agreed', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [appRepo({ private: false })],
		});
		expect(await main(h.ctx, ['file', '--public-app'])).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toHaveLength(1);
	});

	test('a private application files without the flag', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(
			callsOf(h.runner, 'gh', 'api', 'repos/softistx/acme-store'),
		).toHaveLength(1);
	});

	test('an application gh cannot see is not public', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [
				{
					argv: ['gh', 'api', 'repos/softistx/acme-store'],
					result: { code: 1, stderr: 'HTTP 404: Not Found' },
				},
			],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
	});

	test('another gh failure on the application refuses', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [
				{
					argv: ['gh', 'api', 'repos/softistx/acme-store'],
					result: { code: 1, stderr: 'gh: not logged in' },
				},
			],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.failed);
		expect(writes(h)).toEqual([]);
	});
});

describe('file: application domains', () => {
	test('warns when no domain is configured', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		await fileCommand(h.ctx, {});
		expect(h.err.join('\n')).toContain('no application domain is configured');
	});

	test('no warning once .nxgt-issues.json lists them', async () => {
		const app = makeApp();
		writeFileSync(
			join(app, '.nxgt-issues.json'),
			JSON.stringify({ appDomains: ['acme.io'] }),
		);
		const h = harness({ cwd: app, stdin: report() });
		await fileCommand(h.ctx, {});
		expect(h.err.join('\n')).not.toContain('no application domain');
	});
});

describe('file: a closed issue with the same fingerprint', () => {
	const FP = fingerprint(PKG, 'bug', 'parse drops the last item of a list');
	const closed = (labels: string[]) => ({
		argv: [
			'gh',
			'issue',
			'list',
			'--state',
			'all',
			'--limit',
			'200',
			'--label',
			'consumer-report',
		],
		result: {
			stdout: JSON.stringify([
				{
					number: 7,
					title: 't',
					state: 'CLOSED',
					url: 'https://github.com/softistx/nxgt-widget/issues/7',
					body: fingerprintMarker(FP),
					labels: labels.map((name) => ({ name })),
				},
			]),
		},
	});

	test('closed and released: bump instead, no comment', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [closed(['bug', 'released'])],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out.join('\n')).toContain('released');
		expect(h.out.join('\n')).toContain('Bump the package');
		expect(callsOf(h.runner, 'gh', 'issue', 'comment')).toEqual([]);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});

	test('closed and released, but --new after a bump: filed again', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [closed(['released'])],
		});
		expect(await fileCommand(h.ctx, { force: true })).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toHaveLength(1);
	});

	test('closed, not released: comment and wait for the release', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [closed(['bug'])],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'comment', '7')).toHaveLength(1);
		expect(h.out.join('\n')).toContain('wait for the release');
	});
});

describe('file: flags, allowed names, search words', () => {
	test('the package and its repository may be named', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report({
				summary: 'In @nxgt/widget (softistx/nxgt-widget, nxgt-widget).',
			}),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
	});

	test('searchQuery keeps at most six plain words', () => {
		expect(searchQuery('a "parse()" drops, the last item of lists x')).toBe(
			'parse drops the last item lists',
		);
	});

	test.each([
		[['file', '--duplicate-of']],
		[['file', '--duplicate-of', '--new']],
	])('%p is a usage error', async (argv) => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		expect(await main(h.ctx, argv)).toBe(EXIT.usage);
		expect(h.runner.calls).toEqual([]);
	});
});

describe('file: a 403 that is not a rate limit', () => {
	test('reports a permission failure (exit 6) and pauses nothing', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [
				{
					argv: ['gh', 'issue', 'create'],
					result: {
						code: 1,
						stderr:
							'HTTP 403: Resource not accessible by personal access token',
					},
				},
			],
		});
		expect(await fileCommand(h.ctx, { force: true })).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('permission');
		expect(await fileCommand(h.ctx, { force: true })).toBe(EXIT.failed);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toHaveLength(2);
	});
});
