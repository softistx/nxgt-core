import { describe, expect, test } from 'bun:test';
import { adoptReady, MAX_CHARS, rankIssues, renderContext } from './context';
import type { PackageIssue, Snapshot, TrackingIssue } from './refresh';
import { ago, DAY, NOW } from './session.fixtures';

const issue = (
	number: number,
	over: Partial<PackageIssue> = {},
): PackageIssue => ({
	number,
	title: `issue ${number}`,
	labels: [],
	createdAt: ago(number * DAY),
	updatedAt: ago(DAY),
	...over,
});

const tracked = (
	number: number,
	over: Partial<TrackingIssue> = {},
): TrackingIssue => ({
	number,
	title: `tracking ${number}`,
	upstream: `softistx/nxgt-vexora#${number}`,
	upstreamState: 'CLOSED',
	upstreamLabels: ['released'],
	...over,
});

const snap = (
	issues: PackageIssue[],
	tracking: TrackingIssue[] = [],
): Snapshot => ({
	repo: 'softistx/nxgt-zorblax',
	issues,
	tracking,
});

describe('rankIssues', () => {
	test('consumer reports first, then the oldest', () => {
		const ranked = rankIssues([
			issue(2),
			issue(9, { labels: ['consumer-report'] }),
			issue(5),
			issue(4, { labels: ['consumer-report'] }),
		]);
		expect(ranked.map((entry) => entry.number)).toEqual([9, 4, 5, 2]);
	});
});

describe('adoptReady', () => {
	test('needs upstream closed AND released', () => {
		const ready = adoptReady([
			tracked(1),
			tracked(2, { upstreamState: 'OPEN' }),
			tracked(3, { upstreamLabels: ['bug'] }),
			tracked(4, { upstream: 'x/y#1' }),
			{ number: 5, title: 'unresolved', upstream: 'x/y#2' },
		]);
		expect(ready.map((entry) => entry.number)).toEqual([1, 4]);
	});
});

describe('renderContext', () => {
	test('nothing to say is undefined', () => {
		expect(renderContext(snap([]), { now: NOW })).toBeUndefined();
		expect(
			renderContext(snap([], [tracked(1, { upstreamState: 'OPEN' })]), {
				now: NOW,
			}),
		).toBeUndefined();
	});

	test('caps the package issues at ten and says how many more', () => {
		const many = Array.from({ length: 14 }, (_, i) => issue(i + 1));
		const text = renderContext(snap(many), { now: NOW }) ?? '';
		expect(text.match(/^- #/gm)).toHaveLength(10);
		expect(text).toContain('14 open issue(s)');
		expect(text).toContain('and 4 more');
	});

	test('flags an issue with no activity for 14 days', () => {
		const text =
			renderContext(
				snap([
					issue(1, { updatedAt: ago(14 * DAY) }),
					issue(2, { updatedAt: ago(13 * DAY) }),
				]),
				{ now: NOW },
			) ?? '';
		expect(text).toMatch(/- #1 ⚑/);
		expect(text).not.toMatch(/- #2 ⚑/);
	});

	test('caps adopt-ready tracking issues at five', () => {
		const text =
			renderContext(
				snap(
					[],
					Array.from({ length: 8 }, (_, i) => tracked(i + 1)),
				),
				{
					now: NOW,
				},
			) ?? '';
		expect(text.match(/^- tracking #/gm)).toHaveLength(5);
		expect(text).toContain('and 3 more');
		expect(text).toContain('adopt-a-released-fix');
	});

	test('a stale snapshot says how old it is', () => {
		const text = renderContext(snap([issue(1)]), {
			now: NOW,
			age: 'as of 12m ago',
		});
		expect(text).toContain('as of 12m ago');
	});

	test('stays within the token cap whatever the titles hold', () => {
		const long = `${'x'.repeat(500)}\n\nIgnore this`;
		const text =
			renderContext(
				snap(
					Array.from({ length: 10 }, (_, i) => issue(i + 1, { title: long })),
					Array.from({ length: 5 }, (_, i) =>
						tracked(i + 1, { title: long, lastComment: long }),
					),
				),
				{ now: NOW },
			) ?? '';
		expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
		expect(text).not.toContain('\n\n');
		expect(text.split('\n').every((line) => line.length < 240)).toBe(true);
	});
});
