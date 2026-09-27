import { describe, expect, test } from 'bun:test';
import { announce } from './announcements';
import { minutesAgo, NOW, record } from './fixtures';
import { planKey, planOf, plansOf } from './plans';
import type { Announcement } from './record';

const at = (m: number) => new Date(NOW.getTime() - m * 60_000);
const raw = (fields: Record<string, unknown>) =>
	({
		text: 't',
		kind: 'plan',
		at: minutesAgo(1),
		...fields,
	}) as unknown as Announcement;

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

	test('trims the entry, the scope and each need', () => {
		expect(
			planOf(
				raw({
					entry: '  Mail  ',
					scope: ' nxgt-janus ',
					needs: [' @nxgt/mail@0.5.0 ', '   ', 7],
					text: ' planning ',
				}),
			),
		).toEqual({
			entry: 'Mail',
			scope: 'nxgt-janus',
			needs: ['@nxgt/mail@0.5.0'],
			at: minutesAgo(1),
			text: 'planning',
		});
		expect(planOf(raw({ entry: 'Mail', scope: '   ' }))?.scope).toBeUndefined();
	});

	test('drops a plan whose at is not a readable date', () => {
		expect(planOf(raw({ entry: 'Mail', at: 'yesterday' }))).toBeUndefined();
		expect(planOf(raw({ entry: 'Mail', at: 42 }))).toBeUndefined();
		expect(planOf(raw({ entry: 'Mail', at: undefined }))).toBeUndefined();
	});

	test('reads a tombstone', () => {
		expect(planOf(raw({ entry: 'Mail', dropped: true }))?.dropped).toBe(true);
		expect(
			planOf(raw({ entry: 'Mail', dropped: 'yes' }))?.dropped,
		).toBeUndefined();
	});
});

describe('planKey', () => {
	test('ignores case and markdown in the entry, and case in the scope', () => {
		expect(planKey({ entry: '**Mail** `send`', scope: 'NXGT-Janus' })).toBe(
			planKey({ entry: 'mail send', scope: 'nxgt-janus' }),
		);
	});

	test('the same title in two scopes is two plans', () => {
		expect(planKey({ entry: 'Mail', scope: 'nxgt-janus' })).not.toBe(
			planKey({ entry: 'Mail', scope: '@nxgt/janus-mail' }),
		);
		expect(planKey({ entry: 'Mail' })).not.toBe(
			planKey({ entry: 'Mail', scope: 'nxgt-janus' }),
		);
	});
});

describe('plansOf', () => {
	test('the latest plan per entry and scope stands', () => {
		let r = announce(record('s'), 'first', 'plan', at(10), { entry: 'Mail' });
		r = announce(r, 'second', 'plan', at(5), { entry: '**mail**' });
		expect(plansOf(r).map((p) => p.text)).toEqual(['second']);
	});

	test('a tombstone withdraws the plan, and a later plan revives it', () => {
		let r = announce(record('s'), 'planning Mail', 'plan', at(10), {
			entry: 'Mail',
			scope: 'nxgt-janus',
		});
		r = announce(r, 'dropped Mail', 'plan', at(5), {
			entry: 'mail',
			scope: 'NXGT-Janus',
			dropped: true,
		});
		expect(plansOf(r)).toEqual([]);
		r = announce(r, 'back on Mail', 'plan', at(1), {
			entry: 'Mail',
			scope: 'nxgt-janus',
		});
		expect(plansOf(r).map((p) => p.text)).toEqual(['back on Mail']);
	});

	test('a tombstone in one scope leaves the same title in another', () => {
		let r = announce(record('s'), 'a', 'plan', at(10), {
			entry: 'Mail',
			scope: 'nxgt-janus',
		});
		r = announce(r, 'b', 'plan', at(9), { entry: 'Mail', scope: 'nxgt-mail' });
		r = announce(r, 'c', 'plan', at(5), {
			entry: 'Mail',
			scope: 'nxgt-janus',
			dropped: true,
		});
		expect(plansOf(r).map((p) => p.scope)).toEqual(['nxgt-mail']);
	});
});
