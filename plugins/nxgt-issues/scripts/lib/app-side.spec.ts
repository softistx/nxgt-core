import { afterAll, describe, expect, test } from 'bun:test';
import { NOW, seeded, TRACKING } from './app-side.fixtures';
import { main } from './cli';
import { callsOf, harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import type { TrackingIssue } from './refresh';
import { GRAPHQL } from './session.fixtures';

afterAll(removeTempDirs);

describe('ready', () => {
	test('lists closed and released tracking issues only, with the release version', async () => {
		const h = seeded({});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.ok);
		expect(h.out).toEqual([
			'tracking #21 workaround 21 -> softistx/nxgt-widget#12 (closed, released, @nxgt/widget@1.4.0)',
			'tracking #24 workaround 24 -> softistx/nxgt-widget#15 (closed, released)',
		]);
		expect(h.runner.calls).toEqual([]);
	});

	test('--json is machine readable; a comment from a stranger gives no version', async () => {
		const h = seeded({});
		expect(await main(h.ctx, ['ready', '--json'])).toBe(EXIT.ok);
		expect(JSON.parse(h.out.join('\n'))).toEqual([
			{
				tracking: 21,
				title: 'workaround 21',
				upstream: 'softistx/nxgt-widget#12',
				package: '@nxgt/widget',
				version: '1.4.0',
			},
			{
				tracking: 24,
				title: 'workaround 24',
				upstream: 'softistx/nxgt-widget#15',
			},
		]);
	});

	test('says so when nothing waits', async () => {
		const h = seeded({}, [TRACKING[1] as TrackingIssue]);
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.ok);
		expect(h.out).toEqual(['nothing to adopt: no released fix waits.']);
	});

	test('a missing cache refreshes through gh and fills the cache', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => !argv.join(' ').includes('u0:'),
					result: {
						stdout: JSON.stringify({
							data: {
								repository: {
									issues: { nodes: [], totalCount: 1 },
									tracking: {
										totalCount: 1,
										nodes: [
											{
												number: 5,
												title: 'workaround',
												body: '<!-- nxgt-issues:upstream=softistx/nxgt-widget#12 -->',
											},
										],
									},
								},
							},
						}),
					},
				},
				{
					argv: GRAPHQL,
					result: {
						stdout: JSON.stringify({
							data: {
								u0: {
									issue: {
										state: 'CLOSED',
										labels: { nodes: [{ name: 'released' }] },
										comments: { nodes: [] },
									},
								},
							},
						}),
					},
				},
			],
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.ok);
		expect(h.out[0]).toContain('tracking #5');
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toHaveLength(2);
		// The second command finds the cache fresh: no further call.
		await main(h.ctx, ['ready']);
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toHaveLength(2);
	});

	test('a foreign origin is refused before any call', async () => {
		const h = harness({
			cwd: makeApp('git@github.com:other/thing.git'),
			now: NOW,
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.refusedGate);
		expect(h.runner.calls).toEqual([]);
	});

	test('a failed refresh falls back to the stale cache and warns', async () => {
		const h = seeded({
			run: [{ argv: GRAPHQL, result: { code: 1, stderr: 'HTTP 502' } }],
			now: NOW + 3_600_000,
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.ok);
		expect(h.out[0]).toContain('tracking #21');
		expect(h.err.join('\n')).toContain('using the cache');
	});

	test('no cache and a rate limit exits 5', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: GRAPHQL,
					result: { code: 1, stderr: 'HTTP 429 rate limit exceeded' },
				},
			],
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.rateLimited);
	});

	test('no cache and a gh failure exits 6', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{ argv: GRAPHQL, result: { code: 1, stderr: 'HTTP 502 bad gateway' } },
			],
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.failed);
	});
});
