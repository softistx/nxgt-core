import { describe, expect, test } from 'bun:test';
import { minutesAgo, NOW, record } from './fixtures';
import { markWarned, recordEdit, shouldWarn, yieldEdits } from './holds';
import { isInside } from './paths';
import { readSettings } from './settings';
import { ago } from './time';

describe('warning throttle', () => {
	test('warns once per peer per ten minutes', () => {
		const r = markWarned(
			record('s'),
			['p'],
			new Date(NOW.getTime() - 5 * 60_000),
		);
		expect(shouldWarn(r, 'p', NOW)).toBe(false);
		expect(shouldWarn(r, 'q', NOW)).toBe(true);
		expect(
			shouldWarn(
				markWarned(record('s'), ['p'], new Date(NOW.getTime() - 11 * 60_000)),
				'p',
				NOW,
			),
		).toBe(true);
	});

	test('markWarned with nobody returns the record unchanged', () => {
		const r = record('s');
		expect(markWarned(r, [], NOW)).toBe(r);
	});
});

describe('yieldEdits', () => {
	const r = recordEdit(
		recordEdit(record('s'), '/w/a/x.ts', '/w', NOW),
		'/w/b.ts',
		'/w',
		NOW,
	);

	test('releases every edit, or only those under a path', () => {
		expect(yieldEdits(r).edits).toEqual([]);
		expect(yieldEdits(r, '/w/a').edits.map((e) => e.path)).toEqual(['/w/b.ts']);
		expect(yieldEdits(r, '/w/b.ts').edits.map((e) => e.path)).toEqual([
			'/w/a/x.ts',
		]);
	});
});

describe('readSettings', () => {
	test('reads positive numbers and falls back on anything else', () => {
		expect(
			readSettings({
				NXGT_CREW_STALE_MINUTES: '5',
				NXGT_CREW_EDIT_WINDOW_MINUTES: 'abc',
				NXGT_CREW_IDLE_HOURS: '-1',
			}),
		).toEqual({
			staleMinutes: 5,
			editWindowMinutes: 60,
			idleHours: 12,
		});
	});
});

describe('isInside and ago', () => {
	test('containment is by path segment', () => {
		expect(isInside('/a/b', '/a')).toBe(true);
		expect(isInside('/a', '/a')).toBe(true);
		expect(isInside('/ab', '/a')).toBe(false);
		expect(isInside('/a', '/a/b')).toBe(false);
	});

	test('ago', () => {
		expect(ago(NOW.toISOString(), NOW)).toBe('just now');
		expect(ago(minutesAgo(12), NOW)).toBe('12 min ago');
		expect(ago(minutesAgo(180), NOW)).toBe('3 h ago');
	});
});
