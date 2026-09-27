import { describe, expect, test } from 'bun:test';
import { minutesAgo, NOW, record, SETTINGS } from './fixtures';
import { liveness, livePeers, sweepable } from './liveness';

const unknown = () => undefined;
const alive = () => true;
const dead = () => false;

describe('liveness', () => {
	test('a session seen within the stale window is active', () => {
		expect(
			liveness(
				record('a', { lastSeen: minutesAgo(29) }),
				NOW,
				SETTINGS,
				unknown,
			),
		).toBe('active');
	});

	test('a silent session with no known process is gone after the stale window', () => {
		expect(
			liveness(
				record('a', { lastSeen: minutesAgo(31) }),
				NOW,
				SETTINGS,
				unknown,
			),
		).toBe('gone');
	});

	test('a silent session whose process is alive is idle, up to the idle cap', () => {
		const r = record('a', { pid: 42, lastSeen: minutesAgo(120) });
		expect(liveness(r, NOW, SETTINGS, alive)).toBe('idle');
		const old = record('a', { pid: 42, lastSeen: minutesAgo(13 * 60) });
		expect(liveness(old, NOW, SETTINGS, alive)).toBe('gone');
	});

	test('a session whose process exited is gone at once, however recent', () => {
		expect(
			liveness(
				record('a', { pid: 42, lastSeen: minutesAgo(0) }),
				NOW,
				SETTINGS,
				dead,
			),
		).toBe('gone');
	});

	test('an unreadable timestamp is gone, never live', () => {
		expect(
			liveness(record('a', { lastSeen: 'garbage' }), NOW, SETTINGS, unknown),
		).toBe('gone');
	});
});

describe('livePeers and sweepable', () => {
	const records = [
		record('self'),
		record('old', { lastSeen: minutesAgo(5) }),
		record('new', { lastSeen: minutesAgo(1) }),
		record('stale', { lastSeen: minutesAgo(90) }),
	];

	test('lists every other live session, most recently seen first', () => {
		expect(
			livePeers(records, 'self', NOW, SETTINGS, unknown).map(
				(p) => p.record.sessionId,
			),
		).toEqual(['new', 'old']);
	});

	test('sweeps only gone records, never this session', () => {
		const withStaleSelf = [
			...records,
			record('self', { lastSeen: minutesAgo(999) }),
		];
		expect(sweepable(withStaleSelf, 'self', NOW, SETTINGS, unknown)).toEqual([
			'stale',
		]);
	});
});
