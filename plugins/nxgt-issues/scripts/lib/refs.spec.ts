import { describe, expect, test } from 'bun:test';
import {
	closingRefs,
	formatIssueRef,
	parseIssueRef,
	upstreamMarker,
	upstreamRef,
} from './refs';

describe('closingRefs', () => {
	test.each([
		'Fixes #12',
		'fixes #12',
		'FIXED #12',
		'Fix #12',
		'Closes #12',
		'closed #12',
		'Close #12',
		'Resolves #12',
		'resolved #12',
		'Resolve #12',
		'Fixes: #12',
	])('%p closes #12', (text) => {
		expect(closingRefs(text)).toEqual([{ number: 12 }]);
	});

	test('several references, each once, in order', () => {
		expect(closingRefs('Fixes #3, fixes #1.\nCloses #3\nResolves #2')).toEqual([
			{ number: 3 },
			{ number: 1 },
			{ number: 2 },
		]);
	});

	test('owner/repo#n', () => {
		expect(closingRefs('Fixes softistx/nxgt-core#7')).toEqual([
			{ repo: { owner: 'softistx', repo: 'nxgt-core' }, number: 7 },
		]);
	});

	test('the same number in two repositories counts twice', () => {
		expect(closingRefs('Fixes a/b#1 and fixes #1')).toHaveLength(2);
	});

	test.each([
		'See #12',
		'Relates to #12',
		'prefixes #12',
		'unfixes #12',
		'Fixes the bug in #12',
		'Fixes #',
		'refixes #12',
		'',
	])('%p closes nothing', (text) => {
		expect(closingRefs(text)).toEqual([]);
	});

	test('a keyword inside a longer word does not count', () => {
		expect(closingRefs('enclosed #4')).toEqual([]);
	});
});

describe('parseIssueRef / formatIssueRef', () => {
	test('round trip', () => {
		expect(parseIssueRef('softistx/nxgt-core#9')).toEqual({
			repo: { owner: 'softistx', repo: 'nxgt-core' },
			number: 9,
		});
		expect(parseIssueRef(' #9 ')).toEqual({ number: 9 });
		expect(formatIssueRef({ repo: { owner: 'a', repo: 'b' }, number: 2 })).toBe(
			'a/b#2',
		);
		expect(formatIssueRef({ number: 2 })).toBe('#2');
	});

	test.each(['', '9', 'a/b', 'a/b#', '#x', 'a/b#1 extra'])(
		'rejects %p',
		(text) => {
			expect(parseIssueRef(text)).toBeUndefined();
		},
	);
});

describe('upstream marker', () => {
	const ref = { repo: { owner: 'softistx', repo: 'nxgt-core' }, number: 42 };

	test('is written and read back', () => {
		const marker = upstreamMarker(ref);
		expect(marker).toBe('<!-- nxgt-issues:upstream=softistx/nxgt-core#42 -->');
		expect(upstreamRef(`Tracks it.\n\n${marker}\n`)).toEqual(ref);
	});

	test('the first marker wins; none gives undefined', () => {
		const body = `${upstreamMarker(ref)}\n${upstreamMarker({ ...ref, number: 1 })}`;
		expect(upstreamRef(body)?.number).toBe(42);
		expect(upstreamRef('nothing here')).toBeUndefined();
		expect(upstreamRef('<!-- nxgt-issues:upstream=bad -->')).toBeUndefined();
	});
});
