import { afterAll, describe, expect, test } from 'bun:test';
import { grep, seeded } from './app-side.fixtures';
import { CACHE_TTL_MS, cachePath, readEntry } from './cache';
import { main } from './cli';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { adoptReady, renderContext } from './context';
import type { DashIssue } from './dashboard';
import { duplicateCounts } from './dashboard-data';
import { GhError } from './github';
import * as refreshModule from './refresh';
import { fetchUpstream, refreshRepo } from './refresh';
import { fakeRunner } from './runner.fixtures';
import { GRAPHQL, home, listing, ME, NOW } from './session.fixtures';
import { snapshotFresh } from './snapshot';

afterAll(removeTempDirs);

const OWNERS = ['softistx'];
const REF = { repo: { owner: 'softistx', repo: 'nxgt-vexora' }, number: 12 };

const answer = (data: unknown, errors: unknown[]) => ({
	argv: GRAPHQL,
	result: {
		code: 1,
		stderr: 'gh: errors',
		stdout: JSON.stringify({ data, errors }),
	},
});
const issueData = (state: string, labels: string[] = []) => ({
	issue: {
		state,
		labels: { nodes: labels.map((name) => ({ name })) },
		comments: { nodes: [] },
	},
});

describe('one GraphQL transport', () => {
	test('refresh.ts no longer carries its own graphql()', () => {
		expect('graphql' in refreshModule).toBe(false);
	});
});

describe('fetchUpstream: an errored alias', () => {
	test('NOT_FOUND is a missing issue: no state, no throw', async () => {
		const runner = fakeRunner({
			run: [
				answer({ u0: null }, [
					{ type: 'NOT_FOUND', path: ['u0', 'issue'], message: 'gone' },
				]),
			],
		});
		const found = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[REF],
		);
		expect(found).toEqual([{ labels: [] }]);
	});

	test('any other error is unknown, never "not found"', async () => {
		const runner = fakeRunner({
			run: [
				answer({ u0: null }, [
					{ type: 'SERVICE_UNAVAILABLE', path: ['u0'], message: 'timeout' },
				]),
			],
		});
		const found = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[REF],
		);
		expect(found).toEqual([{ labels: [], unknown: true }]);
	});

	test('an error naming no alias taints the whole answer: it throws', async () => {
		const runner = fakeRunner({
			run: [answer({ u0: null }, [{ type: 'SERVICE_UNAVAILABLE' }])],
		});
		await expect(
			fetchUpstream({ runner, home: home(), now: () => NOW }, [REF]),
		).rejects.toBeInstanceOf(GhError);
	});

	test('an error with no type is unknown too', async () => {
		const runner = fakeRunner({
			run: [answer({ u0: null }, [{ path: ['u0'], message: 'boom' }])],
		});
		const found = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[REF],
		);
		expect(found[0]?.unknown).toBe(true);
	});

	test('a NOT_FOUND on one alias does not hide a real error on another', async () => {
		const runner = fakeRunner({
			run: [
				answer({ u0: null, u1: null }, [
					{ type: 'NOT_FOUND', path: ['u0', 'issue'] },
					{ type: 'FORBIDDEN', path: ['u1'] },
				]),
			],
		});
		const found = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[REF, REF],
		);
		expect(found[0]).toEqual({ labels: [] });
		expect(found[1]).toEqual({ labels: [], unknown: true });
	});

	test('the other aliases of a partial answer are kept', async () => {
		const runner = fakeRunner({
			run: [
				answer({ u0: null, u1: issueData('CLOSED', ['released']) }, [
					{ type: 'NOT_FOUND', path: ['u0', 'issue'] },
				]),
			],
		});
		const found = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[REF, REF],
		);
		expect(found[0]?.state).toBeUndefined();
		expect(found[1]).toMatchObject({ state: 'CLOSED', labels: ['released'] });
	});
});

describe('refreshRepo: an answer with errors is not a full snapshot', () => {
	const tracking = [
		{
			number: 1,
			title: 'w',
			body: '<!-- nxgt-issues:upstream=softistx/nxgt-vexora#12 -->',
		},
	];

	test('an unknown upstream alias is marked unknown on its entry; the snapshot is cached', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: { stdout: listing({ tracking }) },
				},
				answer({ u0: null }, [{ type: 'SERVICE_UNAVAILABLE', path: ['u0'] }]),
			],
		});
		const snapshot = await refreshRepo(
			{ runner, home: h, now: () => NOW },
			ME,
			OWNERS,
		);
		expect(snapshot.tracking[0]?.upstreamUnknown).toBe(true);
		expect(snapshot.tracking[0]?.upstreamState).toBeUndefined();
		expect(readEntry(cachePath(h, ME), NOW)?.data).toEqual(snapshot);
	});

	test('a pathless failure of the upstream query fails the refresh and caches nothing', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: { stdout: listing({ tracking }) },
				},
				answer({ u0: null }, [{ type: 'SERVICE_UNAVAILABLE' }]),
			],
		});
		await expect(
			refreshRepo({ runner, home: h, now: () => NOW }, ME, OWNERS),
		).rejects.toBeInstanceOf(GhError);
		expect(readEntry(cachePath(h, ME), NOW)).toBeUndefined();
	});

	test('a listing that came back with errors is refused, not cached', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				answer(
					{ repository: { issues: { nodes: [] }, tracking: { nodes: [] } } },
					[{ type: 'INTERNAL', path: ['repository', 'reports'], message: 'x' }],
				),
			],
		});
		await expect(
			refreshRepo({ runner, home: h, now: () => NOW }, ME, OWNERS),
		).rejects.toBeInstanceOf(GhError);
		expect(readEntry(cachePath(h, ME), NOW)).toBeUndefined();
	});

	test('the listing asks for twenty labels an issue', async () => {
		const runner = fakeRunner({
			run: [{ argv: GRAPHQL, result: { stdout: listing({}) } }],
		});
		await refreshRepo({ runner, home: home(), now: () => NOW }, ME, OWNERS);
		const query = runner.calls[0]?.argv.join(' ') ?? '';
		expect(query).toContain('labels(first:20)');
		expect(query).not.toContain('labels(first:10)');
	});
});

describe('duplicateCounts: an errored alias', () => {
	const report = (number: number): DashIssue => ({
		repo: 'softistx/zorblax-core',
		number,
		title: 't',
		labels: ['consumer-report'],
		createdAt: '2026-10-01T00:00:00Z',
		updatedAt: '2026-10-01T00:00:00Z',
	});

	test('is left out, so the dashboard shows "affected ?"', async () => {
		const runner = fakeRunner({
			run: [
				answer(
					{
						r0: null,
						r1: {
							issue: {
								comments: {
									nodes: [
										{
											body: 'Another consumer hit this.',
											authorAssociation: 'OWNER',
										},
									],
								},
							},
						},
					},
					[{ type: 'SERVICE_UNAVAILABLE', path: ['r0'] }],
				),
			],
		});
		const counts = await duplicateCounts(
			{ runner, home: home(), now: () => NOW },
			[report(1), report(2)],
		);
		expect(counts.has('softistx/zorblax-core#1')).toBe(false);
		expect(counts.get('softistx/zorblax-core#2')).toBe(1);
	});

	test('a NOT_FOUND alias is left out as well', async () => {
		const runner = fakeRunner({
			run: [
				answer({ r0: null }, [{ type: 'NOT_FOUND', path: ['r0', 'issue'] }]),
			],
		});
		const counts = await duplicateCounts(
			{ runner, home: home(), now: () => NOW },
			[report(1)],
		);
		expect(counts.size).toBe(0);
	});
});

describe('markers on a public application: an errored lookup is not "unresolvable"', () => {
	const WIDGET = 'src/a.ts:1:// Temporary, until @nxgt/widget#';
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

	test('a transient GraphQL error exits 6 and reports nothing unresolvable', async () => {
		const h = seeded(
			{
				run: [
					publicApp,
					answer({ u0: null }, [{ type: 'SERVICE_UNAVAILABLE', path: ['u0'] }]),
					grep(`${WIDGET}77\n`),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.failed);
		expect(h.out.join('\n')).not.toContain('unresolvable');
		expect(h.out.join('\n')).toContain('unreadable');
	});

	test('one unreadable marker among three: the other two are reported, the run exits 6', async () => {
		const issue = (n: number) => ({
			[`u${n}`]: issueData('CLOSED', ['released']),
		});
		const h = seeded(
			{
				run: [
					publicApp,
					answer({ ...issue(0), u1: null, ...issue(2) }, [
						{ type: 'FORBIDDEN', path: ['u1'] },
					]),
					grep(`${WIDGET}1\n${WIDGET}2\n${WIDGET}3\n`),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers', '--json'])).toBe(EXIT.failed);
		const reports = JSON.parse(h.out.join('\n'));
		expect(reports.map((r: { status: string }) => r.status)).toEqual([
			'ready',
			'unreadable',
			'ready',
		]);
	});

	test('the closing line counts an unreadable marker apart, not as flagged', async () => {
		const issue = (n: number) => ({
			[`u${n}`]: issueData('CLOSED', ['released']),
		});
		const h = seeded(
			{
				run: [
					publicApp,
					answer({ ...issue(0), u1: null, ...issue(2) }, [
						{ type: 'FORBIDDEN', path: ['u1'] },
					]),
					grep(`${WIDGET}1\n${WIDGET}2\n${WIDGET}3\n`),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.failed);
		expect(h.out.at(-1)).toBe('2 of 3 marker(s) flagged; 1 unreadable.');
	});

	test('a NOT_FOUND upstream is still unresolvable', async () => {
		const h = seeded(
			{
				run: [
					publicApp,
					answer({ u0: null }, [{ type: 'NOT_FOUND', path: ['u0', 'issue'] }]),
					grep(`${WIDGET}77\n`),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.flagged);
		expect(h.out.join('\n')).toContain('unresolvable');
	});
});

describe('a tracking entry whose upstream could not be read', () => {
	const entry = (n: number) => ({
		number: n,
		title: `w${n}`,
		body: `<!-- nxgt-issues:upstream=softistx/nxgt-vexora#${n} -->`,
	});
	const closed = (n: number) => ({
		[`u${n}`]: issueData('CLOSED', ['released']),
	});

	function threeAliases() {
		return fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: { stdout: listing({ tracking: [1, 2, 3].map(entry) }) },
				},
				answer({ ...closed(0), u1: null, ...closed(2) }, [
					{ type: 'FORBIDDEN', path: ['u1'] },
				]),
			],
		});
	}

	test('the other two are cached and rendered; the entry is unreadable, not ready', async () => {
		const h = home();
		const snapshot = await refreshRepo(
			{ runner: threeAliases(), home: h, now: () => NOW },
			ME,
			OWNERS,
		);
		expect(snapshot.tracking.map((t) => t.upstreamState)).toEqual([
			'CLOSED',
			undefined,
			'CLOSED',
		]);
		expect(snapshot.tracking[1]?.upstreamUnknown).toBe(true);
		expect(adoptReady(snapshot.tracking).map((t) => t.number)).toEqual([1, 3]);
		const text = renderContext(snapshot, { now: NOW }) ?? '';
		expect(text).toContain('tracking #1');
		expect(text).toContain('tracking #3');
		expect(text).toContain('upstream unreadable');
		expect(text).toContain('#2');
	});

	test('`ready` lists the readable two, warns on stderr and exits 0', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: { stdout: listing({ tracking: [1, 2, 3].map(entry) }) },
				},
				answer({ ...closed(0), u1: null, ...closed(2) }, [
					{ type: 'FORBIDDEN', path: ['u1'] },
				]),
			],
		});
		expect(await main(h.ctx, ['ready'])).toBe(EXIT.ok);
		expect(h.out.join('\n')).toContain('tracking #1');
		expect(h.out.join('\n')).not.toContain('tracking #2');
		expect(h.err.join('\n')).toContain('unreadable');
	});

	test('a snapshot with an unknown entry is fresh for two minutes only', () => {
		const snapshot = {
			repo: 'softistx/nxgt-zorblax',
			issues: [],
			tracking: [
				{
					number: 1,
					title: 't',
					upstream: 'a/b#1',
					upstreamUnknown: true as const,
				},
			],
		};
		const entry = (ageMs: number) => ({
			fresh: ageMs < CACHE_TTL_MS,
			ageMs,
			data: snapshot,
		});
		expect(snapshotFresh(entry(60_000))).toBe(true);
		expect(snapshotFresh(entry(3 * 60_000))).toBe(false);
		const whole = { ...snapshot, tracking: [] };
		expect(snapshotFresh({ ...entry(5 * 60_000), data: whole })).toBe(true);
	});
});
