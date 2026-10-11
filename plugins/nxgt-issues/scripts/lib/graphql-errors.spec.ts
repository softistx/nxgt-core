import { afterAll, describe, expect, test } from 'bun:test';
import { grep, seeded } from './app-side.fixtures';
import { cachePath, readEntry } from './cache';
import { main } from './cli';
import { removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import type { DashIssue } from './dashboard';
import { duplicateCounts } from './dashboard-data';
import { GhError } from './github';
import * as refreshModule from './refresh';
import { fetchUpstream, refreshRepo } from './refresh';
import { fakeRunner } from './runner.fixtures';
import { GRAPHQL, home, listing, ME, NOW } from './session.fixtures';

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
		await expect(
			fetchUpstream({ runner, home: home(), now: () => NOW }, [REF]),
		).rejects.toBeInstanceOf(GhError);
	});

	test('an error with no type is unknown too', async () => {
		const runner = fakeRunner({
			run: [answer({ u0: null }, [{ path: ['u0'], message: 'boom' }])],
		});
		await expect(
			fetchUpstream({ runner, home: home(), now: () => NOW }, [REF]),
		).rejects.toThrow(/u0|upstream/i);
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
		await expect(
			fetchUpstream({ runner, home: home(), now: () => NOW }, [REF, REF]),
		).rejects.toBeInstanceOf(GhError);
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

	test('an unknown upstream alias fails the refresh and caches nothing', async () => {
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
