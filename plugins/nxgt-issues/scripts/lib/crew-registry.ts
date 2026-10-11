/**
 * A minimal, read-only copy of nxgt-crew's registry reader and liveness rule
 * (`plugins/nxgt-crew/scripts/lib/{store,liveness,system}.ts`), so `issues.ts
 * sessions` can name the live sessions to tell after a filing without
 * depending on nxgt-crew being installed (owner decision Q13). It reads
 * `<crew home>/sessions/*.json` and never writes. Copied, not imported: each
 * plugin installs on its own (AGENTS.md, deliberate duplications).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

type Env = Record<string, string | undefined>;

/** The fields this plugin reads; a record holds more. */
export interface CrewSession {
	readonly sessionId: string;
	readonly cwd: string;
	readonly lastSeen: string;
	readonly title?: string | undefined;
	readonly worktree?: string | undefined;
	readonly remote?: string | undefined;
	readonly branch?: string | undefined;
	readonly pid?: number | undefined;
	readonly pidStart?: string | undefined;
	readonly host?: string | undefined;
}

/** `$NXGT_CREW_HOME`, else `$CLAUDE_CONFIG_DIR/nxgt-crew`, else `~/.claude/nxgt-crew`. */
export function crewHome(env: Env): string {
	if (env['NXGT_CREW_HOME']) return env['NXGT_CREW_HOME'];
	const config = env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude');
	return join(config, 'nxgt-crew');
}

const optionalString = (value: unknown): boolean =>
	value === undefined || typeof value === 'string';

export function isCrewSession(value: unknown): value is CrewSession {
	if (!value || typeof value !== 'object') return false;
	const r = value as Record<string, unknown>;
	return (
		r['version'] === 1 &&
		typeof r['sessionId'] === 'string' &&
		typeof r['cwd'] === 'string' &&
		typeof r['lastSeen'] === 'string' &&
		(r['pid'] === undefined || typeof r['pid'] === 'number') &&
		['title', 'worktree', 'remote', 'branch', 'pidStart', 'host'].every((key) =>
			optionalString(r[key]),
		)
	);
}

/** Every record that parses; a torn or foreign file is skipped. */
export function readSessions(home: string): CrewSession[] {
	const dir = join(home, 'sessions');
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const out: CrewSession[] = [];
	for (const name of names) {
		if (!name.endsWith('.json')) continue;
		try {
			const value: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
			if (isCrewSession(value)) out.push(value);
		} catch {
			// skip it
		}
	}
	return out;
}

export interface CrewSettings {
	readonly staleMinutes: number;
	readonly idleHours: number;
}

/** nxgt-crew's knobs and defaults (30 minutes, 12 hours). */
export function crewSettings(env: Env): CrewSettings {
	const num = (key: string, fallback: number): number => {
		const n = Number(env[key]);
		return env[key] && Number.isFinite(n) && n > 0 ? n : fallback;
	};
	return {
		staleMinutes: num('NXGT_CREW_STALE_MINUTES', 30),
		idleHours: num('NXGT_CREW_IDLE_HOURS', 12),
	};
}

/** `true` alive, `false` dead, `undefined` unknown (another host, no probe). */
export type PidProbe = (session: CrewSession) => boolean | undefined;

/** The pid check of nxgt-crew, without the Linux start-time comparison. */
export const probePid: PidProbe = (session) => {
	if (session.pid === undefined || session.host !== hostname())
		return undefined;
	try {
		process.kill(session.pid, 0);
		return true;
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code === 'ESRCH') return false;
		return code === 'EPERM' ? true : undefined; // alive, owned by another user
	}
};

/** Seen within `staleMinutes`, or silent but alive and seen within `idleHours`. */
export function isLive(
	session: CrewSession,
	now: number,
	settings: CrewSettings,
	probe: PidProbe,
): boolean {
	const silence = now - Date.parse(session.lastSeen);
	if (Number.isNaN(silence)) return false;
	const alive = session.pid === undefined ? undefined : probe(session);
	if (alive === false) return false;
	if (silence <= settings.staleMinutes * 60_000) return true;
	return alive === true && silence <= settings.idleHours * 3_600_000;
}

/** Every live session but `selfId`, most recently seen first. */
export function liveSessions(
	env: Env,
	now: number,
	selfId: string | undefined,
	probe: PidProbe = probePid,
): CrewSession[] {
	const settings = crewSettings(env);
	return readSessions(crewHome(env))
		.filter((s) => s.sessionId !== selfId && isLive(s, now, settings, probe))
		.sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}
