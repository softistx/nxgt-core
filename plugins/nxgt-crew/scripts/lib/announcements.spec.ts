import { describe, expect, test } from 'bun:test';
import {
	announce,
	keepAnnouncements,
	markSeen,
	unseenAnnouncements,
} from './announcements';
import { minutesAgo, NOW, record } from './fixtures';
import { LIMITS } from './settings';

const at = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('keepAnnouncements', () => {
	test('a plan outlives the cap while notes pile up after it', () => {
		let r = announce(record('s'), 'planning X', 'plan', at(100), {
			entry: 'X',
		});
		for (let i = 0; i < LIMITS.announcements + 10; i++) {
			r = announce(r, `note ${i}`, 'note', at(99 - i));
		}
		expect(r.announcements).toHaveLength(LIMITS.announcements + 1);
		expect(
			r.announcements.filter((a) => a.kind === 'plan').map((a) => a.entry),
		).toEqual(['X']);
		expect(r.announcements[0]?.text).toBe(`note ${LIMITS.announcements + 9}`);
	});

	test('twenty plans leave working, releases and decisions their own budget', () => {
		let r = announce(record('s'), 'shipped 1.0', 'release', at(200), {});
		r = announce(r, 'on Mail', 'working', at(199));
		r = announce(r, 'use zod', 'decision', at(198));
		for (let i = 0; i < 25; i++) {
			r = announce(r, `plan ${i}`, 'plan', at(150 - i), { entry: `E${i}` });
		}
		const plans = r.announcements.filter((a) => a.kind === 'plan');
		expect(plans).toHaveLength(LIMITS.plans);
		expect(plans[0]?.text).toBe('plan 24');
		expect(r.announcements.map((a) => a.kind)).toContain('working');
		expect(r.announcements.map((a) => a.kind)).toContain('release');
		expect(r.announcements.map((a) => a.kind)).toContain('decision');
	});

	test('the latest working and release survive a flood of notes', () => {
		let r = announce(record('s'), 'shipped 1.0', 'release', at(200), {});
		r = announce(r, 'on Mail', 'working', at(199));
		for (let i = 0; i < 40; i++)
			r = announce(r, `note ${i}`, 'note', at(100 - i));
		expect(r.announcements).toHaveLength(LIMITS.announcements);
		expect(r.announcements.find((a) => a.kind === 'working')?.text).toBe(
			'on Mail',
		);
		expect(r.announcements.find((a) => a.kind === 'release')?.text).toBe(
			'shipped 1.0',
		);
	});

	test('only the latest plan per entry and scope is kept', () => {
		let r = announce(record('s'), 'first', 'plan', at(10), { entry: 'X' });
		r = announce(r, 'second', 'plan', at(5), { entry: '`x`' });
		r = announce(r, 'other', 'plan', at(1), { entry: 'Y' });
		expect(r.announcements.map((a) => a.text)).toEqual(['other', 'second']);
	});

	test('the same title in another scope is another plan', () => {
		let r = announce(record('s'), 'janus', 'plan', at(10), {
			entry: 'Mail',
			scope: 'nxgt-janus',
		});
		r = announce(r, 'mail', 'plan', at(5), {
			entry: 'Mail',
			scope: 'nxgt-mail',
		});
		expect(r.announcements.map((a) => a.text)).toEqual(['mail', 'janus']);
	});

	test('tombstones never evict a live plan', () => {
		let r = announce(record('s'), 'planning Live', 'plan', at(100), {
			entry: 'Live',
		});
		for (let i = 0; i < 10; i++) {
			r = announce(r, `dropped E${i}`, 'plan', at(90 - i), {
				entry: `E${i}`,
				dropped: true,
			});
		}
		const plans = r.announcements.filter((a) => a.kind === 'plan');
		expect(plans.filter((a) => !a.dropped).map((a) => a.entry)).toEqual([
			'Live',
		]);
		expect(plans.filter((a) => a.dropped)).toHaveLength(LIMITS.tombstones);
	});

	test('a tombstone replaces the plan it withdraws', () => {
		let r = announce(record('s'), 'planning X', 'plan', at(10), {
			entry: 'X',
			needs: ['@nxgt/mail@0.5.0'],
		});
		r = announce(r, 'dropped X', 'plan', at(5), {
			entry: 'X',
			needs: ['ignored'],
			dropped: true,
		});
		expect(r.announcements).toEqual([
			{
				text: 'dropped X',
				kind: 'plan',
				at: at(5).toISOString(),
				entry: 'X',
				dropped: true,
			},
		]);
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

describe('announcements seen and unseen', () => {
	test('only peer announcements after seenUntil, oldest first', () => {
		const self = record('self', { seenUntil: minutesAgo(10) });
		const p = record('p', {
			announcements: [
				{ text: 'new', kind: 'release', at: minutesAgo(1) },
				{ text: 'newer-ish', kind: 'decision', at: minutesAgo(5) },
				{ text: 'old', kind: 'working', at: minutesAgo(20) },
			],
		});
		const unseen = unseenAnnouncements(self, [
			{ record: p, liveness: 'active' },
		]);
		expect(unseen.map((u) => u.announcement.text)).toEqual([
			'newer-ish',
			'new',
		]);
		expect(
			unseenAnnouncements(markSeen(self, NOW), [
				{ record: p, liveness: 'active' },
			]),
		).toEqual([]);
	});
});
