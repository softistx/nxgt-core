import { afterAll, describe, expect, test } from 'bun:test';
import { main } from './cli';
import { callsOf, harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import type { RunRule } from './runner.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
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
	repository: { nameWithOwner: name },
	...over,
});
const SEARCH = ['gh', 'search', 'issues'];
const has =
	(...words: string[]) =>
	(argv: readonly string[]) =>
		words.every((word) => argv.includes(word));
const isPackages = (argv: readonly string[]) =>
	argv.join(' ').includes('HEAD:package.json');

const report = [{ name: 'consumer-report' }];
const OPEN: RunRule = {
	argv: SEARCH,
	when: (argv) => has('open')(argv) && !argv.includes('upstream'),
	result: {
		stdout: JSON.stringify([
			row('softistx/zorblax-core', 1, { createdAt: day(40) }),
			row('softistx/zorblax-core', 2, { labels: report, updatedAt: day(30) }),
			row('softistx/zorblax-core', 3, { labels: [{ name: 'upstream' }] }),
			row('SteveGT96/vexora-ui', 4),
			row('stranger/quillon', 5),
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
const DUPES: RunRule = {
	argv: ['gh', 'api', 'graphql'],
	when: (argv) => !isPackages(argv),
	result: {
		stdout: JSON.stringify({
			data: {
				r0: {
					issue: {
						comments: {
							nodes: [
								{
									body: 'Another consumer hit this.',
									authorAssociation: 'OWNER',
								},
								{
									body: 'Another consumer hit this.',
									authorAssociation: 'NONE',
								},
								{ body: 'thanks', authorAssociation: 'OWNER' },
							],
						},
					},
				},
			},
		}),
	},
};
const PACKAGES: RunRule = {
	argv: ['gh', 'api', 'graphql'],
	when: isPackages,
	result: {
		stdout: JSON.stringify({
			data: {
				p0: { root: { text: '{"name":"@vexora/ui"}' }, dirs: null },
				p1: { root: { text: '{"name":"@zorblax/core"}' }, dirs: null },
			},
		}),
	},
};
const RULES = [OPEN, TRACKING, AWAITING, PACKAGES, DUPES];
const fail = (stderr: string, when?: RunRule['when']): RunRule => ({
	argv: ['gh', 'api', 'graphql'],
	...(when ? { when } : {}),
	result: { code: 1, stderr },
});

describe('dashboard', () => {
	test('ranks, hides foreign repositories, lists the awaiting fixes', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		const text = h.out.join('\n');
		expect(text).toContain('@zorblax/core (softistx/zorblax-core)');
		expect(text).toContain('@vexora/ui (SteveGT96/vexora-ui)');
		expect(text).not.toContain('quillon');
		const lines = h.out.filter((l) => l.startsWith('- #'));
		expect(lines[0]).toStartWith('- #1 ● t1');
		// Only the trusted duplicate counts: the reporter plus one.
		expect(lines[1]).toContain('#2 ⚑ [consumer-report]');
		expect(lines[1]).toContain('2 affected');
		expect(text).toContain('softistx/zorblax-core#8 t8');
		expect(text).toContain('closed 3d ago');
	});

	test('stays within three searches and two GraphQL calls; the third carries -- -label:released', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		expect(await main(h.ctx, ['dashboard', '--json'])).toBe(EXIT.ok);
		const searches = callsOf(h.runner, 'gh', 'search');
		expect(searches).toHaveLength(3);
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toHaveLength(2);
		expect(searches[0]?.argv).toContain('--archived=false');
		expect(searches[0]?.argv.filter((a) => a === '--owner')).toHaveLength(2);
		const third = searches[2]?.argv ?? [];
		expect(third.slice(-3)).toEqual([
			'--',
			'-label:released',
			'reason:completed',
		]);
		const board = JSON.parse(h.out.join('\n'));
		expect(Object.keys(board).sort()).toEqual(['awaiting', 'groups', 'notes']);
		expect(JSON.stringify(board)).not.toContain('"body"');
	});

	test('looks up only the repositories that render, tracking-issue repositories excluded', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		await main(h.ctx, ['dashboard']);
		const query =
			callsOf(h.runner, 'gh', 'api', 'graphql')
				.map((c) => c.argv.join(' '))
				.find((q) => q.includes('HEAD:package.json')) ?? '';
		expect(query).toContain('zorblax-core');
		expect(query).toContain('vexora-ui');
		expect(query).not.toContain('acme-store');
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
		const at = argv.indexOf('--owner');
		expect(argv.slice(at, at + 2)).toEqual(['--owner', 'stranger']);
		expect(h.out.join('\n')).toContain('stranger/quillon');
	});

	test('the package map is cached; a second run asks only for duplicate counts', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		await main(h.ctx, ['dashboard']);
		await main(h.ctx, ['dashboard']);
		const packages = callsOf(h.runner, 'gh', 'api', 'graphql').filter((c) =>
			isPackages(c.argv),
		);
		expect(packages).toHaveLength(1);
	});

	test('a search that returns its limit says the list is truncated', async () => {
		const many = Array.from({ length: 200 }, (_, i) =>
			row('softistx/zorblax-core', 100 + i),
		);
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: SEARCH,
					when: (a) => has('open')(a) && !a.includes('upstream'),
					result: { stdout: JSON.stringify(many) },
				},
				TRACKING,
				AWAITING,
				PACKAGES,
				DUPES,
			],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		expect(h.out.join('\n')).toContain('truncated');
	});

	test('a rate limit on a search exits 5 and pauses; the next run spawns nothing', async () => {
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

	test('any other search failure exits 6', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [{ argv: SEARCH, result: { code: 1, stderr: 'boom' } }],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.failed);
		expect(h.err.join('\n')).toContain('boom');
	});

	test('failed duplicate counts keep the board, show affected as unknown and warn', async () => {
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				fail('oops', (a) => !isPackages(a)),
				OPEN,
				TRACKING,
				AWAITING,
				PACKAGES,
			],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		expect(h.err.join('\n')).toContain('duplicate counts unavailable');
		expect(h.out.join('\n')).toContain('affected ?');
		expect(h.out.join('\n')).toContain('@zorblax/core');
	});

	test.each([
		['a rate limit', 'HTTP 429: API rate limit exceeded', 1],
		['a failure', 'HTTP 502: Bad Gateway', 2],
	])(
		'%s on the optional GraphQL calls keeps the board under repository names',
		async (_, stderr, graphqlCalls) => {
			const h = harness({
				cwd: makeApp(),
				now: NOW,
				run: [fail(stderr), OPEN, TRACKING, AWAITING],
			});
			expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
			const text = h.out.join('\n');
			expect(text).toContain('softistx/zorblax-core');
			expect(text).not.toContain('@zorblax/core');
			expect(text).toContain('affected ?');
			expect(h.err.join('\n')).toContain('unavailable');
			// After a rate limit the shared pause stops the second optional call before it spawns gh.
			expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toHaveLength(
				graphqlCalls,
			);
		},
	);

	test('more reports than the cap are explained by a note', async () => {
		const reports = Array.from({ length: 31 }, (_, i) =>
			row('softistx/zorblax-core', 200 + i, { labels: report }),
		);
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [
				{
					argv: SEARCH,
					when: (a) => has('open')(a) && !a.includes('upstream'),
					result: { stdout: JSON.stringify(reports) },
				},
				TRACKING,
				AWAITING,
				PACKAGES,
				{
					argv: ['gh', 'api', 'graphql'],
					result: { stdout: JSON.stringify({ data: {} }) },
				},
			],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		expect(h.out.join('\n')).toContain(
			'duplicate counts cover the first 30 reports',
		);
	});
});

describe('dashboard: data correctness', () => {
	test('"awaiting release" asks only for completed issues', async () => {
		const h = harness({ cwd: makeApp(), now: NOW, run: RULES });
		await main(h.ctx, ['dashboard']);
		const awaiting = callsOf(h.runner, 'gh', 'search')[2]?.argv ?? [];
		expect(awaiting).toContain('--state');
		expect(awaiting.join(' ')).toContain('reason:completed');
	});

	test('an errored duplicate-count alias shows "affected ?"', async () => {
		const errored: RunRule = {
			argv: ['gh', 'api', 'graphql'],
			when: (argv) => !isPackages(argv),
			result: {
				code: 1,
				stderr: 'gh: errors',
				stdout: JSON.stringify({
					data: { r0: null },
					errors: [{ type: 'SERVICE_UNAVAILABLE', path: ['r0'] }],
				}),
			},
		};
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [OPEN, TRACKING, AWAITING, PACKAGES, errored],
		});
		expect(await main(h.ctx, ['dashboard'])).toBe(EXIT.ok);
		const line = h.out.find((l) => l.startsWith('- #2')) ?? '';
		expect(line).toContain('affected ?');
	});

	test('a capitalised Upstream or Consumer-Report label behaves like the lowercase one', async () => {
		const open: RunRule = {
			argv: SEARCH,
			when: (argv) => has('open')(argv) && !argv.includes('upstream'),
			result: {
				stdout: JSON.stringify([
					row('softistx/zorblax-core', 1),
					row('softistx/zorblax-core', 2, {
						labels: [{ name: 'Consumer-Report' }],
						updatedAt: day(1),
					}),
					row('softistx/zorblax-core', 3, { labels: [{ name: 'Upstream' }] }),
				]),
			},
		};
		const h = harness({
			cwd: makeApp(),
			now: NOW,
			run: [open, TRACKING, AWAITING, PACKAGES, DUPES],
		});
		await main(h.ctx, ['dashboard', '--json']);
		const board = JSON.parse(h.out.join('\n'));
		const issues = board.groups.flatMap(
			(g: { issues: { number: number; labels: string[] }[] }) => g.issues,
		);
		expect(issues.map((i: { number: number }) => i.number).sort()).toEqual([
			1, 2,
		]);
		const two = issues.find((i: { number: number }) => i.number === 2);
		expect(two.labels).toEqual(['consumer-report']);
		// counted as a report: the duplicate lookup was made for it
		expect(callsOf(h.runner, 'gh', 'api', 'graphql').length).toBeGreaterThan(1);
	});
});
