import { describe, expect, test } from 'bun:test';
import { announce, keepAnnouncements, planOf } from './announcements';
import { minutesAgo, NOW, record } from './fixtures';
import type { Announcement } from './registry';
import { LIMITS } from './settings';

const at = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('planOf', () => {
	test('reads a well-formed plan', () => {
		const a = announce(record('s'), 'planning X', 'plan', NOW, {
			entry: 'X',
			scope: 'nxgt-janus',
			needs: ['@nxgt/mail@0.5.0'],
		}).announcements[0] as Announcement;
		expect(planOf(a)).toEqual({
			entry: 'X',
			scope: 'nxgt-janus',
			needs: ['@nxgt/mail@0.5.0'],
			at: NOW.toISOString(),
			text: 'planning X',
		});
	});

	test('rejects an entry that is not a string, and a non-plan', () => {
		expect(
			planOf({
				text: 't',
				kind: 'plan',
				at: minutesAgo(1),
				entry: 42,
			} as unknown as Announcement),
		).toBeUndefined();
		expect(
			planOf({
				text: 't',
				kind: 'plan',
				at: minutesAgo(1),
				entry: '  ',
			} as unknown as Announcement),
		).toBeUndefined();
		expect(
			planOf({
				text: 't',
				kind: 'note',
				at: minutesAgo(1),
				entry: 'X',
			} as unknown as Announcement),
		).toBeUndefined();
	});
});

describe('keepAnnouncements', () => {
	test('a plan outlives the cap while notes pile up after it', () => {
		let r = announce(record('s'), 'planning X', 'plan', at(100), {
			entry: 'X',
		});
		for (let i = 0; i < LIMITS.announcements + 10; i++) {
			r = announce(r, `note ${i}`, 'note', at(99 - i));
		}
		expect(r.announcements).toHaveLength(LIMITS.announcements);
		expect(
			r.announcements.filter((a) => a.kind === 'plan').map((a) => a.entry),
		).toEqual(['X']);
		expect(r.announcements[0]?.text).toBe(`note ${LIMITS.announcements + 9}`);
	});

	test('only the latest plan per entry is kept', () => {
		let r = announce(record('s'), 'first', 'plan', at(10), { entry: 'X' });
		r = announce(r, 'second', 'plan', at(5), { entry: 'x' });
		r = announce(r, 'other', 'plan', at(1), { entry: 'Y' });
		expect(r.announcements.map((a) => a.text)).toEqual(['other', 'second']);
	});

	test('newest first, capped, when there is no plan', () => {
		const list = Array.from({ length: 30 }, (_, i) => ({
			text: `${i}`,
			kind: 'note' as const,
			at: at(i).toISOString(),
		}));
		const kept = keepAnnouncements(list.reverse());
		expect(kept).toHaveLength(LIMITS.announcements);
		expect(kept[0]?.text).toBe('0');
	});
});
