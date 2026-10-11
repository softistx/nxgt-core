import { describe, expect, test } from 'bun:test';
import type { DashIssue } from './dashboard';
import { duplicateCounts, MAX_REPORTS } from './dashboard-data';
import { fakeRunner } from './runner.fixtures';

const issue = (number: number, labels: string[]): DashIssue => ({
	repo: 'softistx/zorblax-core',
	number,
	title: 't',
	labels,
	createdAt: '2026-10-01T00:00:00Z',
	updatedAt: '2026-10-01T00:00:00Z',
});

const ctxFor = (stdout: string) => {
	const runner = fakeRunner({
		run: [{ argv: ['gh', 'api', 'graphql'], result: { stdout } }],
	});
	return { runner, ctx: { runner, home: '/nonexistent/nxgt', now: () => 0 } };
};

describe('duplicateCounts', () => {
	test('queries consumer reports only', async () => {
		const { runner, ctx } = ctxFor(JSON.stringify({ data: {} }));
		await duplicateCounts(ctx, [
			issue(1, ['bug']),
			issue(2, ['consumer-report']),
		]);
		const query = runner.calls[0]?.argv.join(' ') ?? '';
		expect(query).toContain('issue(number:2)');
		expect(query).not.toContain('issue(number:1)');
	});

	test('makes no call without a report', async () => {
		const { runner, ctx } = ctxFor('{}');
		expect((await duplicateCounts(ctx, [issue(1, ['bug'])])).size).toBe(0);
		expect(runner.calls).toHaveLength(0);
	});

	test(`asks for at most ${MAX_REPORTS} reports in one call`, async () => {
		const { runner, ctx } = ctxFor(JSON.stringify({ data: {} }));
		const reports = Array.from({ length: MAX_REPORTS + 5 }, (_, i) =>
			issue(i + 1, ['consumer-report']),
		);
		await duplicateCounts(ctx, reports);
		expect(runner.calls).toHaveLength(1);
		const query = runner.calls[0]?.argv.join(' ') ?? '';
		expect(query).toContain(`issue(number:${MAX_REPORTS})`);
		expect(query).not.toContain(`issue(number:${MAX_REPORTS + 1})`);
	});

	test('counts only owner, member and collaborator duplicates', async () => {
		const comment = (authorAssociation: string) => ({
			body: 'Another consumer hit this.',
			authorAssociation,
		});
		const { ctx } = ctxFor(
			JSON.stringify({
				data: {
					r0: {
						issue: {
							comments: {
								nodes: [
									'OWNER',
									'MEMBER',
									'COLLABORATOR',
									'NONE',
									'CONTRIBUTOR',
								].map(comment),
							},
						},
					},
				},
			}),
		);
		const counts = await duplicateCounts(ctx, [issue(2, ['consumer-report'])]);
		expect(counts.get('softistx/zorblax-core#2')).toBe(3);
	});
});
