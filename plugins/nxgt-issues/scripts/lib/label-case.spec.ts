import { afterAll, describe, expect, test } from 'bun:test';
import { grep, seeded, tracking } from './app-side.fixtures';
import { main } from './cli';
import { removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { adoptReady, rankIssues, renderContext } from './context';
import { fetchUpstream, refreshRepo } from './refresh';
import { fakeRunner } from './runner.fixtures';
import { GRAPHQL, home, listing, ME, NOW } from './session.fixtures';
import type { Snapshot } from './snapshot';

afterAll(removeTempDirs);

describe('label names are case-insensitive, as GitHub treats them', () => {
	test('adoptReady accepts a capitalised Released', () => {
		const ready = adoptReady([
			tracking(1, 'softistx/nxgt-widget#1', { upstreamLabels: ['Released'] }),
			tracking(2, 'softistx/nxgt-widget#2', { upstreamLabels: ['RELEASED'] }),
			tracking(3, 'softistx/nxgt-widget#3', { upstreamLabels: ['bug'] }),
		]);
		expect(ready.map((t) => t.number)).toEqual([1, 2]);
	});

	test('rankIssues and the rendering treat Consumer-Report as a report', () => {
		const issue = (number: number, labels: string[]) => ({
			number,
			title: `issue ${number}`,
			labels,
			createdAt: `2026-10-0${number}T00:00:00Z`,
			updatedAt: '2026-10-10T00:00:00Z',
		});
		const issues = [issue(1, []), issue(2, ['Consumer-Report'])];
		expect(rankIssues(issues).map((i) => i.number)).toEqual([2, 1]);
		const snapshot: Snapshot = {
			repo: 'softistx/nxgt-zorblax',
			issues,
			tracking: [],
		};
		const text = renderContext(snapshot, { now: NOW }) ?? '';
		expect(text).toContain('[consumer-report]');
	});

	test('refresh lowercases the labels it parses, upstream ones included', async () => {
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					when: (argv) => argv.join(' ').includes('states:OPEN'),
					result: {
						stdout: listing({
							issues: [
								{
									number: 1,
									title: 'tracking',
									createdAt: '2026-10-01T00:00:00Z',
									updatedAt: '2026-10-01T00:00:00Z',
									labels: { nodes: [{ name: 'Upstream' }] },
								},
								{
									number: 2,
									title: 'report',
									createdAt: '2026-10-01T00:00:00Z',
									updatedAt: '2026-10-01T00:00:00Z',
									labels: { nodes: [{ name: 'Consumer-Report' }] },
								},
							],
							tracking: [
								{
									number: 1,
									title: 't',
									body: '<!-- nxgt-issues:upstream=softistx/nxgt-vexora#9 -->',
								},
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
										labels: { nodes: [{ name: 'Released' }] },
										comments: { nodes: [] },
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
			['softistx'],
		);
		expect(snapshot.issues.map((i) => i.number)).toEqual([2]);
		expect(snapshot.issues[0]?.labels).toEqual(['consumer-report']);
		expect(snapshot.tracking[0]?.upstreamLabels).toEqual(['released']);
		expect(adoptReady(snapshot.tracking)).toHaveLength(1);
	});

	test('fetchUpstream lowercases upstream labels', async () => {
		const runner = fakeRunner({
			run: [
				{
					argv: GRAPHQL,
					result: {
						stdout: JSON.stringify({
							data: {
								u0: {
									issue: {
										state: 'CLOSED',
										labels: { nodes: [{ name: 'Released' }] },
										comments: { nodes: [] },
									},
								},
							},
						}),
					},
				},
			],
		});
		const [issue] = await fetchUpstream(
			{ runner, home: home(), now: () => NOW },
			[{ repo: { owner: 'softistx', repo: 'nxgt-widget' }, number: 1 }],
		);
		expect(issue?.labels).toEqual(['released']);
	});

	test('markers on a public application: a capitalised Released upstream is ready', async () => {
		const h = seeded(
			{
				run: [
					{
						argv: ['gh', 'api', 'repos/softistx/acme-store'],
						result: {
							stdout: JSON.stringify({
								full_name: 'softistx/acme-store',
								has_issues: true,
								archived: false,
								private: false,
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
											labels: { nodes: [{ name: 'Released' }] },
											comments: { nodes: [] },
										},
									},
								},
							}),
						},
					},
					grep('src/a.ts:1:// Temporary, until @nxgt/widget#77\n'),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers', '--json'])).toBe(EXIT.flagged);
		expect(JSON.parse(h.out.join('\n'))[0].status).toBe('ready');
	});
});
