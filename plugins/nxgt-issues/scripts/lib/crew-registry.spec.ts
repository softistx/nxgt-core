import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type CrewSession,
	crewHome,
	crewSettings,
	isLive,
	liveSessions,
	readSessions,
} from './crew-registry';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const session = (id: string, over: Partial<CrewSession> = {}) => ({
	version: 1,
	sessionId: id,
	cwd: `/work/${id}`,
	lastSeen: ago(1),
	...over,
});

function registry(records: unknown[], junk = true): string {
	const home = tempDir('crew');
	mkdirSync(join(home, 'sessions'));
	records.forEach((r, i) => {
		writeFileSync(join(home, 'sessions', `${i}.json`), JSON.stringify(r));
	});
	if (junk) {
		writeFileSync(join(home, 'sessions', 'torn.json'), '{"version":1,');
		writeFileSync(join(home, 'sessions', 'note.txt'), 'x');
	}
	return home;
}

describe('the crew registry, read-only', () => {
	test('crewHome follows nxgt-crew', () => {
		expect(crewHome({ NXGT_CREW_HOME: '/h' })).toBe('/h');
		expect(crewHome({ CLAUDE_CONFIG_DIR: '/c' })).toBe('/c/nxgt-crew');
	});

	test('torn, foreign and malformed records are skipped', () => {
		const home = registry([
			session('a'),
			{ version: 2, sessionId: 'b' },
			session('c', { pid: 'x' as never }),
		]);
		expect(readSessions(home).map((s) => s.sessionId)).toEqual(['a']);
		expect(readSessions(join(home, 'missing'))).toEqual([]);
	});

	test('liveness: recent, idle but alive, gone', () => {
		const settings = crewSettings({});
		const unknown = () => undefined;
		expect(isLive(session('a') as CrewSession, NOW, settings, unknown)).toBe(
			true,
		);
		const silent = session('b', { lastSeen: ago(120), pid: 1 }) as CrewSession;
		expect(isLive(silent, NOW, settings, () => true)).toBe(true);
		expect(isLive(silent, NOW, settings, unknown)).toBe(false);
		expect(
			isLive(
				session('c', { pid: 1 }) as CrewSession,
				NOW,
				settings,
				() => false,
			),
		).toBe(false);
		expect(
			isLive(
				session('d', { lastSeen: 'never' }) as CrewSession,
				NOW,
				settings,
				unknown,
			),
		).toBe(false);
		const old = session('e', { lastSeen: ago(13 * 60), pid: 1 }) as CrewSession;
		expect(isLive(old, NOW, settings, () => true)).toBe(false);
	});

	test('the knobs of nxgt-crew apply', () => {
		expect(
			crewSettings({ NXGT_CREW_STALE_MINUTES: '5', NXGT_CREW_IDLE_HOURS: 'x' }),
		).toEqual({ staleMinutes: 5, idleHours: 12 });
	});

	test('liveSessions drops this session and sorts by last seen', () => {
		const home = registry([
			session('old', { lastSeen: ago(20) }),
			session('self'),
			session('new', { lastSeen: ago(2) }),
			session('gone', { lastSeen: ago(60) }),
		]);
		const live = liveSessions(
			{ NXGT_CREW_HOME: home },
			NOW,
			'self',
			() => undefined,
		);
		expect(live.map((s) => s.sessionId)).toEqual(['new', 'old']);
	});
});
