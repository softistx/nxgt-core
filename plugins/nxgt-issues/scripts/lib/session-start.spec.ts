import { afterAll, describe, expect, test } from 'bun:test';
import { cachePath, writeEntry } from './cache';
import { setStamp, stampFresh } from './refresh-state';
import { type FakeRunner, fakeRunner } from './runner.fixtures';
import {
	checkout,
	DAY,
	GRAPHQL,
	home,
	listing,
	ME,
	NOW,
	removeTempDirs,
	SNAPSHOT,
	seed,
} from './session.fixtures';
import { type SessionStartDeps, sessionStartContext } from './session-start';

afterAll(removeTempDirs);

const ORIGIN = 'git@github.com:softistx/nxgt-zorblax.git';
const REFRESH = ['bun', 'issues.ts', 'refresh', '--cwd', '/x'];

function deps(
	runner: FakeRunner,
	over: Partial<SessionStartDeps> & { origin?: string } = {},
): SessionStartDeps {
	const { origin = ORIGIN, ...rest } = over;
	return {
		runner,
		env: {},
		cwd: checkout(origin),
		home: home(),
		now: () => NOW,
		refreshCommand: REFRESH,
		...rest,
	};
}

const answering = (stdout: string) =>
	fakeRunner({ run: [{ argv: GRAPHQL, result: { stdout } }] });

describe('sessionStartContext: when it stays silent without a single call', () => {
	test('disabled', async () => {
		const runner = fakeRunner();
		const d = deps(runner, { env: { NXGT_ISSUES_DISABLE: '1' } });
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});

	test('no .git', async () => {
		const runner = fakeRunner();
		const d = deps(runner, { cwd: home() });
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});

	test.each([
		'git@github.com:acme/quillon.git',
		'https://github.com/acme/nxgt-zorblax',
		'https://example.com/softistx/nxgt-zorblax.git',
	])('origin %p is not an owner', async (origin) => {
		const runner = fakeRunner();
		const d = deps(runner, { origin });
		seed(d.home, SNAPSHOT, NOW - 60 * DAY);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
		expect(runner.fetches).toHaveLength(0);
	});

	test('NXGT_ISSUES_OWNERS replaces the default allowlist', async () => {
		const runner = fakeRunner();
		const d = deps(runner, { env: { NXGT_ISSUES_OWNERS: 'acme' } });
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});
});

describe('sessionStartContext: the cache', () => {
	test('fresh: renders it and refreshes nothing', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 60_000);
		const text = await sessionStartContext(d);
		expect(text).toContain('parse() drops the last item');
		expect(text).not.toContain('as of');
		expect(runner.calls).toHaveLength(0);
	});

	test('stale: renders "as of Nm ago" and starts one detached refresh', async () => {
		const runner = fakeRunner({ run: [{ argv: ['bun'] }] });
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		const text = await sessionStartContext(d);
		expect(text).toContain('as of 25m ago');
		expect(runner.calls).toHaveLength(1);
		expect(runner.calls[0]?.argv).toEqual(REFRESH);
		expect(runner.calls[0]?.options.detached).toBe(true);
	});

	test('stale and a spawn that throws: still renders', async () => {
		const runner = fakeRunner({ run: [{ argv: ['bun'], throws: 'ENOENT' }] });
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		expect(await sessionStartContext(d)).toContain('as of 25m ago');
	});

	test('stale under a rate limit: renders, starts nothing', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		writeEntry(`${d.home}/cache/rate-limit.json`, { until: NOW + 60_000 }, NOW);
		expect(await sessionStartContext(d)).toContain('as of 25m ago');
		expect(runner.calls).toHaveLength(0);
	});

	test('a corrupt cache file is a cold start', async () => {
		const runner = answering(
			listing({
				issues: [
					{
						number: 1,
						title: 'x',
						createdAt: '2026-10-01T00:00:00Z',
						updatedAt: '2026-10-01T00:00:00Z',
						labels: { nodes: [] },
					},
				],
			}),
		);
		const d = deps(runner);
		writeEntry(cachePath(d.home, ME), { nonsense: true }, NOW);
		expect(await sessionStartContext(d)).toContain('#1');
		expect(runner.calls).toHaveLength(1);
	});
});

describe('sessionStartContext: a cold cache', () => {
	test('one inline refresh, rendered and cached', async () => {
		const runner = answering(
			listing({
				issues: [
					{
						number: 4,
						title: 'Docs miss the retry option',
						createdAt: '2026-10-01T00:00:00Z',
						updatedAt: '2026-10-09T00:00:00Z',
						labels: { nodes: [{ name: 'documentation' }] },
					},
				],
			}),
		);
		const d = deps(runner);
		const text = await sessionStartContext(d);
		expect(text).toContain('Docs miss the retry option');
		expect(runner.calls).toHaveLength(1);
		expect(runner.calls[0]?.options.timeoutMs).toBe(800);
		// The next start reads the cache: no second call.
		expect(await sessionStartContext(d)).toContain('#4');
		expect(runner.calls).toHaveLength(1);
	});

	test('a refresh slower than 800 ms is abandoned', async () => {
		const runner = fakeRunner();
		runner.run = () => new Promise(() => undefined);
		const started = performance.now();
		expect(await sessionStartContext(deps(runner))).toBeUndefined();
		expect(performance.now() - started).toBeLessThan(1500);
	});

	test.each([
		['gh missing', { throws: 'spawn gh ENOENT' }],
		[
			'unauthenticated',
			{ result: { code: 4, stderr: 'gh auth login required' } },
		],
		['bad JSON', { result: { stdout: '<html>' } }],
		[
			'rate limited',
			{ result: { code: 1, stderr: 'API rate limit exceeded' } },
		],
		['no data', { result: { stdout: '{"errors":[]}' } }],
	])('%s: silent', async (_name, rule) => {
		const runner = fakeRunner({ run: [{ argv: GRAPHQL, ...rule }] });
		expect(await sessionStartContext(deps(runner))).toBeUndefined();
	});

	test('while a rate limit lasts, a cold start makes no call', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		writeEntry(`${d.home}/cache/rate-limit.json`, { until: NOW + 60_000 }, NOW);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});
});

describe('sessionStartContext: latency', () => {
	test('p50 under 50 ms on a fresh cache', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 1000);
		const times: number[] = [];
		for (let i = 0; i < 31; i++) {
			const start = performance.now();
			await sessionStartContext(d);
			times.push(performance.now() - start);
		}
		times.sort((a, b) => a - b);
		expect(times[15] ?? Number.POSITIVE_INFINITY).toBeLessThan(50);
		expect(runner.calls).toHaveLength(0);
	});
});

describe('sessionStartContext: a refresh that does not finish', () => {
	test('a cold start over budget starts the detached refresh', async () => {
		const runner = fakeRunner({ run: [{ argv: ['bun'] }] });
		runner.run = (async (argv, options) => {
			(runner.calls as unknown[]).push({ argv, options: options ?? {} });
			return options?.detached
				? { code: 0, stdout: '', stderr: '' }
				: new Promise(() => undefined);
		}) as typeof runner.run;
		const d = deps(runner);
		expect(await sessionStartContext(d)).toBeUndefined();
		const detached = runner.calls.filter((call) => call.options.detached);
		expect(detached).toHaveLength(1);
		expect(detached[0]?.argv).toEqual(REFRESH);
		// a second start inside a minute does not spawn a second one
		await sessionStartContext(d);
		expect(runner.calls.filter((call) => call.options.detached)).toHaveLength(
			1,
		);
	});

	test('a fast failure leaves a stamp, and for ten minutes no call is made', async () => {
		const runner = fakeRunner({
			run: [{ argv: GRAPHQL, throws: 'spawn gh ENOENT' }],
		});
		const d = deps(runner);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(1);
		expect(stampFresh(d.home, ME, 'failed', NOW)).toBe(true);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(1);
		const later = { ...d, now: () => NOW + 11 * 60_000 };
		await sessionStartContext(later);
		expect(runner.calls).toHaveLength(2);
	});

	test('a stale cache is rendered but not refreshed while a failure stamp is fresh', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		setStamp(d.home, ME, 'failed', NOW - 60_000);
		expect(await sessionStartContext(d)).toContain('as of 25m ago');
		expect(runner.calls).toHaveLength(0);
	});

	test('a stale refresh in progress (lock under 60 s) is not started twice', async () => {
		const runner = fakeRunner({ run: [{ argv: ['bun'] }] });
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		await sessionStartContext(d);
		await sessionStartContext(d);
		expect(runner.calls).toHaveLength(1);
		await sessionStartContext({ ...d, now: () => NOW + 61_000 });
		expect(runner.calls).toHaveLength(2);
	});
});
