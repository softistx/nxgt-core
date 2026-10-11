import { afterAll, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachePath, writeEntry } from './cache';
import { claimStamp, setStamp, stampFresh } from './refresh-state';
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
import {
	COLD_BUDGET_MS,
	type SessionStartDeps,
	sessionStartContext,
} from './session-start';

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

/**
 * A gh call that takes `delayMs` and is cut at its `timeoutMs`, as the real
 * runner does: code 143 and `timedOut`. Detached runs return at once.
 */
function slowGh(runner: FakeRunner, delayMs: number, stdout = ''): void {
	runner.run = (async (argv, options) => {
		(runner.calls as unknown[]).push({ argv, options: options ?? {} });
		if (options?.detached) return { code: 0, stdout: '', stderr: '' };
		const cap = options?.timeoutMs ?? Number.POSITIVE_INFINITY;
		await Bun.sleep(Math.min(delayMs, cap));
		return delayMs > cap
			? { code: 143, stdout: '', stderr: '', timedOut: true }
			: { code: 0, stdout, stderr: '' };
	}) as typeof runner.run;
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
		// The per-call cap leaves a margin under the 800 ms budget, so the child
		// ends before the hook does.
		expect(runner.calls[0]?.options.timeoutMs).toBe(COLD_BUDGET_MS - 150);
		// The next start reads the cache: no second call.
		expect(await sessionStartContext(d)).toContain('#4');
		expect(runner.calls).toHaveLength(1);
	});

	test('a refresh slower than 800 ms is abandoned', async () => {
		const runner = fakeRunner();
		slowGh(runner, 10_000);
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
		slowGh(runner, 10_000);
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

const ONE = {
	number: 1,
	title: 'x',
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-01T00:00:00Z',
	labels: { nodes: [] },
};

describe('sessionStartContext: the cold path leaves nothing behind', () => {
	/** A runner whose gh calls never finish and record the signal they were given. */
	function hanging() {
		const runner = fakeRunner({ run: [{ argv: ['bun'] }] });
		const signals: (AbortSignal | undefined)[] = [];
		slowGh(runner, 10_000);
		const inner = runner.run;
		runner.run = ((argv, options) => {
			if (!options?.detached) signals.push(options?.signal);
			return inner.call(runner, argv, options);
		}) as typeof runner.run;
		return { runner, signals };
	}

	test('an inline refresh over budget is killed before the hook returns', async () => {
		const { runner, signals } = hanging();
		expect(await sessionStartContext(deps(runner))).toBeUndefined();
		expect(signals).toHaveLength(1);
		expect(signals[0]?.aborted).toBe(true);
	});

	test('an inline refresh that finished is not aborted late, and still renders', async () => {
		const runner = answering(listing({ issues: [ONE] }));
		expect(await sessionStartContext(deps(runner))).toContain('#1');
	});

	test('a failed inline refresh leaves no live child either', async () => {
		const signals: (AbortSignal | undefined)[] = [];
		const runner = fakeRunner();
		runner.run = (async (_argv, options) => {
			signals.push(options?.signal);
			throw new Error('spawn gh ENOENT');
		}) as typeof runner.run;
		await sessionStartContext(deps(runner));
		expect(signals[0]).toBeDefined();
		expect(signals[0]?.aborted).toBe(true);
	});

	test('a fresh refreshing stamp on a cold cache is idle: no inline attempt', async () => {
		const runner = fakeRunner();
		const d = deps(runner);
		claimStamp(d.home, ME, 'refreshing', NOW - 10_000);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(runner.calls).toHaveLength(0);
	});

	test('an expired refreshing stamp on a cold cache is no reason to wait', async () => {
		const runner = answering(listing({ issues: [ONE] }));
		const d = deps(runner);
		claimStamp(d.home, ME, 'refreshing', NOW - 61_000);
		expect(await sessionStartContext(d)).toContain('#1');
		expect(runner.calls).toHaveLength(1);
	});

	test('two starts at once start one detached refresh', async () => {
		const { runner } = hanging();
		const d = deps(runner);
		seed(d.home, SNAPSHOT, NOW - 25 * 60_000);
		await Promise.all([sessionStartContext(d), sessionStartContext(d)]);
		expect(runner.calls.filter((call) => call.options.detached)).toHaveLength(
			1,
		);
	});

	test('an unwritable home still renders what the refresh fetched', async () => {
		const runner = answering(
			listing({
				issues: [
					{
						number: 9,
						title: 'Still shown',
						createdAt: '2026-10-01T00:00:00Z',
						updatedAt: '2026-10-09T00:00:00Z',
						labels: { nodes: [] },
					},
				],
			}),
		);
		const d = deps(runner);
		// Where the cache folder should be, a file.
		writeFileSync(join(d.home, 'cache'), 'not a folder');
		expect(await sessionStartContext(d)).toContain('Still shown');
	});
});

describe('sessionStartContext: a call the runner cut is a timeout, not a failure', () => {
	test('a listing taking 700 ms leaves no failed stamp and starts the detached refresh', async () => {
		const runner = fakeRunner();
		slowGh(runner, 700, listing({ issues: [ONE] }));
		const d = deps(runner);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(stampFresh(d.home, ME, 'failed', NOW)).toBe(false);
		const detached = runner.calls.filter((call) => call.options.detached);
		expect(detached).toHaveLength(1);
		expect(detached[0]?.argv).toEqual(REFRESH);
		// The detached refresh fills the cache; the next session renders it.
		seed(d.home, SNAPSHOT, NOW);
		expect(await sessionStartContext(d)).toContain('parse() drops');
		expect(runner.calls.filter((call) => call.options.detached)).toHaveLength(
			1,
		);
	});

	test('a genuine failure (exit 1) still leaves the failed stamp', async () => {
		const runner = fakeRunner({
			run: [{ argv: GRAPHQL, result: { code: 1, stderr: 'boom' } }],
		});
		const d = deps(runner);
		expect(await sessionStartContext(d)).toBeUndefined();
		expect(stampFresh(d.home, ME, 'failed', NOW)).toBe(true);
		expect(runner.calls.filter((call) => call.options.detached)).toHaveLength(
			0,
		);
	});
});
