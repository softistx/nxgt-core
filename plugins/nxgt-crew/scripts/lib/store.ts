/**
 * The registry on disk: one JSON file per session under
 * `<home>/sessions/<sessionId>.json`, where `<home>` is `$NXGT_CREW_HOME`, else
 * `$CLAUDE_CONFIG_DIR/nxgt-crew`, else `~/.claude/nxgt-crew`.
 *
 * Each session writes only its own file, through a temporary file and a rename,
 * so a reader never sees half a record. A file that does not parse, or parses
 * to something that is not a record, is skipped — never trusted, never fatal.
 */

import { randomBytes } from 'node:crypto';
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { merge } from './merge';
import { isRecord, type SessionRecord } from './record';

export function crewHome(env: Record<string, string | undefined>): string {
	if (env.NXGT_CREW_HOME) return env.NXGT_CREW_HOME;
	const config = env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
	return join(config, 'nxgt-crew');
}

const sessionsDir = (home: string) => join(home, 'sessions');

/** Session ids are UUIDs; anything else is reduced to a safe file name. */
export function fileName(sessionId: string): string {
	const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
	return `${safe || 'unknown'}.json`;
}

export function readAll(home: string): SessionRecord[] {
	const dir = sessionsDir(home);
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const out: SessionRecord[] = [];
	for (const name of names) {
		if (!name.endsWith('.json')) continue;
		try {
			const value: unknown = JSON.parse(readFileSync(join(dir, name), 'utf8'));
			if (isRecord(value)) out.push(value);
		} catch {
			// A torn or foreign file: skip it.
		}
	}
	return out;
}

export function readOne(
	home: string,
	sessionId: string,
): SessionRecord | undefined {
	try {
		const value: unknown = JSON.parse(
			readFileSync(join(sessionsDir(home), fileName(sessionId)), 'utf8'),
		);
		return isRecord(value) && value.sessionId === sessionId ? value : undefined;
	} catch {
		return undefined;
	}
}

export function write(home: string, record: SessionRecord): void {
	const dir = sessionsDir(home);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const target = join(dir, fileName(record.sessionId));
	const temp = join(
		dir,
		`.${fileName(record.sessionId)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
	);
	writeFileSync(temp, `${JSON.stringify(record, null, '\t')}\n`, {
		mode: 0o600,
	});
	try {
		renameSync(temp, target);
	} catch (error) {
		rmSync(temp, { force: true });
		throw error;
	}
}

/**
 * Writes this session's record after folding in whatever another of its own
 * hooks wrote since `next` was read — see `merge`. What a hook adds is never
 * lost to a parallel hook; what it removes needs `write`.
 */
export function writeMerged(home: string, next: SessionRecord): void {
	const onDisk = readOne(home, next.sessionId);
	write(home, onDisk ? merge(onDisk, next) : next);
}

/** Deletes one session's record — the only deletion this plugin ever performs. */
export function remove(home: string, sessionId: string): void {
	rmSync(join(sessionsDir(home), fileName(sessionId)), { force: true });
}
