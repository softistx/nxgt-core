import { describe, expect, test } from 'bun:test';
import { announce, currentWork } from './announcements';
import { minutesAgo, NOW, record, SETTINGS } from './fixtures';
import { claim, recentEdits, recordEdit, unclaim } from './holds';
import { heartbeat, isRecord, register } from './record';
import { LIMITS } from './settings';

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

describe('isRecord', () => {
	test('accepts a record and rejects anything else', () => {
		expect(isRecord(record('s'))).toBe(true);
		expect(isRecord({ ...record('s'), version: 2 })).toBe(false);
		expect(isRecord({ sessionId: 's' })).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord('x')).toBe(false);
	});
});
