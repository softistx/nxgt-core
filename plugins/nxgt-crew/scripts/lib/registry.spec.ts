import { describe, expect, test } from 'bun:test';
import { minutesAgo, NOW, record, SETTINGS } from './fixtures';
import {
	ago,
	announce,
	claim,
	currentWork,
	heartbeat,
	isInside,
	isRecord,
	LIMITS,
	liveness,
	livePeers,
	markSeen,
	markWarned,
	merge,
	readSettings,
	recentEdits,
	recordEdit,
	register,
	shouldWarn,
	sweepable,
	unclaim,
	unseenAnnouncements,
	yieldEdits,
} from './registry';

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

describe('register', () => {
	test('a new session starts empty, having seen nothing yet', () => {
		const r = register(
			undefined,
			{ sessionId: 's', cwd: '/w', branch: 'develop', worktree: '/w' },
			NOW,
		);
		expect(r).toMatchObject({
			version: 1,
			sessionId: 's',
			cwd: '/w',
			branch: 'develop',
			edits: [],
			announcements: [],
		});
		expect(r.seenUntil).toBe(NOW.toISOString());
	});

	test('claims the scratchpad folder', () => {
		const r = register(
			undefined,
			{ sessionId: 's', cwd: '/w', scratchpad: '/tmp/pad' },
			NOW,
		);
		expect(r.claims.map((c) => c.path)).toEqual(['/tmp/pad']);
	});

	test('a resumed session keeps its edits and announcements and refreshes its place', () => {
		const before = announce(
			recordEdit(record('s', { branch: 'a' }), '/w/f.ts', '/w', NOW),
			'x',
			'working',
			NOW,
		);
		const after = register(
			before,
			{ sessionId: 's', cwd: '/w2', branch: 'b' },
			NOW,
		);
		expect(after.edits).toHaveLength(1);
		expect(after.announcements).toHaveLength(1);
		expect(after.branch).toBe('b');
		expect(after.cwd).toBe('/w2');
	});
});

describe('record changes', () => {
	test('heartbeat moves lastSeen, and the git place only when given', () => {
		const r = record('s', { lastSeen: minutesAgo(10), branch: 'a' });
		expect(heartbeat(r, NOW).branch).toBe('a');
		expect(heartbeat(r, NOW).lastSeen).toBe(NOW.toISOString());
		expect(heartbeat(r, NOW, { place: { branch: 'b' } }).branch).toBe('b');
	});

	test('recordEdit keeps one entry per file, newest first, capped', () => {
		let r = record('s');
		for (let i = 0; i < LIMITS.edits + 5; i++)
			r = recordEdit(r, `/w/${i}`, '/w', NOW);
		r = recordEdit(r, '/w/3', '/w', NOW);
		expect(r.edits).toHaveLength(LIMITS.edits);
		expect(r.edits[0]?.path).toBe('/w/3');
		expect(r.edits.filter((e) => e.path === '/w/3')).toHaveLength(1);
	});

	test('recentEdits drops edits older than the window', () => {
		const r = record('s', {
			edits: [
				{ path: '/a', at: minutesAgo(10) },
				{ path: '/b', at: minutesAgo(61) },
			],
		});
		expect(recentEdits(r, NOW, SETTINGS).map((e) => e.path)).toEqual(['/a']);
	});

	test('claim and unclaim', () => {
		const r = claim(record('s'), '/tmp/x', 'scratch', NOW);
		expect(r.claims[0]).toMatchObject({ path: '/tmp/x', note: 'scratch' });
		expect(unclaim(r, '/tmp/x').claims).toEqual([]);
	});

	test('announce collapses whitespace, truncates, ignores empty text', () => {
		const r = announce(
			record('s'),
			'  publishing\n @nxgt/mail   0.5.0 ',
			'release',
			NOW,
		);
		expect(r.announcements[0]?.text).toBe('publishing @nxgt/mail 0.5.0');
		expect(announce(r, '   ', 'note', NOW)).toBe(r);
		const long = announce(record('s'), 'x'.repeat(1000), 'note', NOW);
		expect(long.announcements[0]?.text.length).toBe(LIMITS.announcementLength);
	});

	test('a plan keeps its entry, scope and needs; other kinds drop them', () => {
		const r = announce(record('s'), 'planning X', 'plan', NOW, {
			entry: ' X  entry ',
			scope: '@nxgt/a',
			needs: ['@nxgt/mail@0.5.0', ' '],
		});
		expect(r.announcements[0]).toEqual({
			text: 'planning X',
			kind: 'plan',
			at: NOW.toISOString(),
			entry: 'X entry',
			scope: '@nxgt/a',
			needs: ['@nxgt/mail@0.5.0'],
		});
		const n = announce(record('s'), 'n', 'note', NOW, { entry: 'X' });
		expect(n.announcements[0]).toEqual({
			text: 'n',
			kind: 'note',
			at: NOW.toISOString(),
		});
	});

	test('currentWork is the latest working announcement', () => {
		let r = announce(record('s'), 'first', 'working', NOW);
		r = announce(r, 'a release', 'release', NOW);
		r = announce(r, 'second', 'working', NOW);
		expect(currentWork(r)?.text).toBe('second');
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

describe('isRecord', () => {
	test('accepts a record and rejects anything else', () => {
		expect(isRecord(record('s'))).toBe(true);
		expect(isRecord({ ...record('s'), version: 2 })).toBe(false);
		expect(isRecord({ sessionId: 's' })).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord('x')).toBe(false);
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

describe('merge', () => {
	test('keeps what a parallel hook added, and the later timestamps', () => {
		const onDisk = recordEdit(
			record('s', { lastSeen: NOW.toISOString() }),
			'/w/a.ts',
			'/w',
			NOW,
		);
		const next = claim(
			recordEdit(
				record('s', { lastSeen: minutesAgo(1) }),
				'/w/b.ts',
				'/w',
				NOW,
			),
			'/tmp/x',
			undefined,
			NOW,
		);
		const merged = merge(onDisk, next);
		expect(merged.edits.map((e) => e.path).sort()).toEqual([
			'/w/a.ts',
			'/w/b.ts',
		]);
		expect(merged.claims.map((c) => c.path)).toEqual(['/tmp/x']);
		expect(merged.lastSeen).toBe(NOW.toISOString());
	});

	test('one entry per file, the most recent', () => {
		const old = recordEdit(
			record('s'),
			'/w/a.ts',
			'/w',
			new Date(NOW.getTime() - 60_000),
		);
		const fresh = recordEdit(record('s'), '/w/a.ts', '/w', NOW);
		expect(merge(old, fresh).edits).toEqual(fresh.edits);
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
