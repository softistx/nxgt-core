import { afterAll, describe, expect, test } from 'bun:test';
import { cachePath, readEntry } from './cache';
import { RateLimitedError } from './github';
import { refreshRepo, upstreamQuery } from './refresh';
import { setStamp, stampFresh, stampPath } from './refresh-state';
import { fakeRunner } from './runner.fixtures';
import {
	GRAPHQL,
	home,
	listing,
	ME,
	NOW,
	removeTempDirs,
} from './session.fixtures';
import type { Snapshot } from './snapshot';

afterAll(removeTempDirs);

const OWNERS = ['softistx', 'SteveGT96'];
const marker = (ref: string) =>
	`Tracks it.\n<!-- nxgt-issues:upstream=${ref} -->`;

const issueNode = (number: number, labels: string[]) => ({
	number,
	title: `issue ${number}`,
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-02T00:00:00Z',
	labels: { nodes: labels.map((name) => ({ name })) },
});

describe('refreshRepo', () => {
	test('one call for a package repository, written to the cache', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					result: { stdout: listing({ issues: [issueNode(7, ['bug'])] }) },
				},
			],
		});
		const snapshot = await refreshRepo(
			{ runner, home: h, now: () => NOW },
			ME,
			OWNERS,
		);
		expect(runner.calls).toHaveLength(1);
		const args = runner.calls[0]?.argv ?? [];
		expect(args.slice(0, 4)).toEqual(['gh', 'api', 'graphql', '-f']);
		expect(args.join(' ')).toContain('states:OPEN');
		expect(args.join(' ')).toContain('labels:["upstream"]');
		expect(args).toContain('owner=softistx');
		expect(args).toContain('name=nxgt-zorblax');
		expect(snapshot.issues.map((issue) => issue.number)).toEqual([7]);
		const entry = readEntry<Snapshot>(cachePath(h, ME), NOW);
		expect(entry?.fresh).toBe(true);
		expect(entry?.data.repo).toBe('softistx/nxgt-zorblax');
	});

	test('a tracking issue costs a second, aliased call with the upstream state', async () => {
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: {
						stdout: listing({
							issues: [issueNode(1, ['upstream'])],
							tracking: [
								{
									number: 1,
									title: 'widget bug',
									body: marker('softistx/nxgt-vexora#12'),
								},
								{ number: 2, title: 'foreign', body: marker('acme/quillon#4') },
								{ number: 3, title: 'no marker', body: 'nothing' },
							],
						}),
					},
				},
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('u0:repository'),
					result: {
						stdout: JSON.stringify({
							data: {
								u0: {
									issue: {
										state: 'CLOSED',
										labels: { nodes: [{ name: 'released' }] },
										comments: {
											nodes: [
												{
													body: 'Fixed in @nxgt/vexora@1.2.3',
													authorAssociation: 'MEMBER',
												},
											],
										},
									},
								},
							},
						}),
					},
				},
			],
		});
		const snapshot = await refreshRepo(
			{ runner, home: home(), now: () => NOW },
			ME,
			OWNERS,
		);
		expect(runner.calls).toHaveLength(2);
		const second = runner.calls[1]?.argv.join(' ') ?? '';
		expect(second).toContain(
			'u0:repository(owner:"softistx",name:"nxgt-vexora")',
		);
		expect(second).not.toContain('quillon');
		expect(snapshot.issues).toEqual([]);
		expect(snapshot.tracking).toEqual([
			{
				number: 1,
				title: 'widget bug',
				upstream: 'softistx/nxgt-vexora#12',
				upstreamState: 'CLOSED',
				upstreamLabels: ['released'],
				lastComment: 'Fixed in @nxgt/vexora@1.2.3',
				lastCommentBy: 'MEMBER',
			},
		]);
	});

	test('upstreamQuery aliases each reference', () => {
		const query = upstreamQuery([
			{ repo: { owner: 'a', repo: 'b' }, number: 1 },
			{ repo: { owner: 'c', repo: 'd' }, number: 2 },
		]);
		expect(query).toContain(
			'u0:repository(owner:"a",name:"b"){issue(number:1)',
		);
		expect(query).toContain(
			'u1:repository(owner:"c",name:"d"){issue(number:2)',
		);
	});

	test('a rate-limit refusal pauses and throws; the cache is left alone', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					result: { code: 1, stderr: 'API rate limit exceeded (HTTP 403)' },
				},
			],
		});
		const ctx = { runner, home: h, now: () => NOW };
		await expect(refreshRepo(ctx, ME, OWNERS)).rejects.toBeInstanceOf(
			RateLimitedError,
		);
		expect(readEntry(cachePath(h, ME), NOW)).toBeUndefined();
		await expect(refreshRepo(ctx, ME, OWNERS)).rejects.toBeInstanceOf(
			RateLimitedError,
		);
		expect(runner.calls).toHaveLength(1);
	});

	test('bad JSON and an answer without data throw', async () => {
		for (const stdout of ['not json', '{"errors":[{"message":"x"}]}']) {
			const runner = fakeRunner({
				run: [{ argv: GRAPHQL, result: { stdout } }],
			});
			await expect(
				refreshRepo({ runner, home: home(), now: () => NOW }, ME, OWNERS),
			).rejects.toThrow();
		}
	});
});

describe('refreshRepo: partial GraphQL answers', () => {
	test('a failed exit with data is cached; a null upstream is unknown, the rest intact', async () => {
		const h = home();
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: {
						stdout: listing({
							tracking: [
								{
									number: 1,
									title: 'gone',
									body: marker('softistx/nxgt-vexora#12'),
								},
								{
									number: 2,
									title: 'fine',
									body: marker('softistx/nxgt-quillon#3'),
								},
							],
						}),
					},
				},
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('u0:repository'),
					result: {
						code: 1,
						stderr: 'gh: Could not resolve to an Issue',
						stdout: JSON.stringify({
							data: {
								u0: null,
								u1: {
									issue: {
										state: 'CLOSED',
										labels: { nodes: [{ name: 'released' }] },
										comments: { nodes: [] },
									},
								},
							},
							errors: [{ type: 'NOT_FOUND' }],
						}),
					},
				},
			],
		});
		const snapshot = await refreshRepo(
			{ runner, home: h, now: () => NOW },
			ME,
			OWNERS,
		);
		expect(snapshot.tracking[0]?.upstreamState).toBeUndefined();
		expect(snapshot.tracking[1]?.upstreamState).toBe('CLOSED');
		expect(
			readEntry<Snapshot>(cachePath(h, ME), NOW)?.data.tracking,
		).toHaveLength(2);
	});

	test('a missing repository throws', async () => {
		const runner = fakeRunner({
			run: [
				{ argv: GRAPHQL, result: { stdout: '{"data":{"repository":null}}' } },
			],
		});
		await expect(
			refreshRepo({ runner, home: home(), now: () => NOW }, ME, OWNERS),
		).rejects.toThrow();
	});
});

describe('refreshRepo: the listing', () => {
	test('one call carries the consumer-report alias and the total, merged without duplicates', async () => {
		const reportNode = issueNode(60, ['consumer-report']);
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					result: {
						stdout: JSON.stringify({
							data: {
								repository: {
									issues: {
										totalCount: 75,
										nodes: [issueNode(1, ['bug']), reportNode],
									},
									reports: {
										nodes: [reportNode, issueNode(61, ['consumer-report'])],
									},
									tracking: { totalCount: 0, nodes: [] },
								},
							},
						}),
					},
				},
			],
		});
		const snapshot = await refreshRepo(
			{ runner, home: home(), now: () => NOW },
			ME,
			OWNERS,
		);
		expect(runner.calls).toHaveLength(1);
		expect(runner.calls[0]?.argv.join(' ')).toContain(
			'reports:issues(states:OPEN,labels:["consumer-report"],first:10',
		);
		expect(
			snapshot.issues.map((issue) => issue.number).sort((a, b) => a - b),
		).toEqual([1, 60, 61]);
		expect(snapshot.total).toBe(75);
	});
});

describe('refreshRepo: stamps', () => {
	test('a successful refresh removes both stamps', async () => {
		const h = home();
		setStamp(h, ME, 'failed', NOW);
		setStamp(h, ME, 'refreshing', NOW);
		const runner = fakeRunner({
			run: [{ argv: GRAPHQL, result: { stdout: listing({}) } }],
		});
		await refreshRepo({ runner, home: h, now: () => NOW }, ME, OWNERS);
		expect(stampFresh(h, ME, 'failed', NOW)).toBe(false);
		expect(stampFresh(h, ME, 'refreshing', NOW)).toBe(false);
	});

	test('a stamp path never equals the cache path of another repository', () => {
		const foo = { owner: 'softistx', repo: 'foo' };
		const odd = { owner: 'softistx', repo: 'foo.failed' };
		for (const kind of ['failed', 'refreshing'] as const) {
			expect(stampPath('/h', foo, kind)).not.toBe(cachePath('/h', odd));
		}
		expect(stampPath('/h', foo, 'failed')).not.toBe(
			stampPath('/h', odd, 'failed'),
		);
	});
});
