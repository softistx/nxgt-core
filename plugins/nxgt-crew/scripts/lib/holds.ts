/**
 * What a session holds and lets go of: the files it edited recently, the
 * folders it claims, and when it was last told it shares a worktree. Pure.
 */

import type { Claim, Edit, SessionRecord } from './record';
import { LIMITS, type Settings } from './settings';
import { minutes } from './time';

/** Edits still inside the window. */
export function recentEdits(
	record: SessionRecord,
	now: Date,
	settings: Settings,
): Edit[] {
	const floor = now.getTime() - minutes(settings.editWindowMinutes);
	return record.edits.filter((e) => Date.parse(e.at) >= floor);
}

export function recordEdit(
	record: SessionRecord,
	path: string,
	worktree: string | undefined,
	now: Date,
): SessionRecord {
	const edit: Edit = worktree
		? { path, worktree, at: now.toISOString() }
		: { path, at: now.toISOString() };
	const edits = [edit, ...record.edits.filter((e) => e.path !== path)].slice(
		0,
		LIMITS.edits,
	);
	return { ...record, edits };
}

export function claim(
	record: SessionRecord,
	path: string,
	note: string | undefined,
	now: Date,
): SessionRecord {
	const entry: Claim = note
		? { path, note, at: now.toISOString() }
		: { path, at: now.toISOString() };
	const claims = [entry, ...record.claims.filter((c) => c.path !== path)].slice(
		0,
		LIMITS.claims,
	);
	return { ...record, claims };
}

export function unclaim(record: SessionRecord, path: string): SessionRecord {
	return { ...record, claims: record.claims.filter((c) => c.path !== path) };
}

/** Whether this session should be told again that it shares a worktree with `peerId`. */
export function shouldWarn(
	record: SessionRecord,
	peerId: string,
	now: Date,
	everyMinutes = 10,
): boolean {
	const last = record.warned?.[peerId];
	if (!last) return true;
	return now.getTime() - Date.parse(last) > minutes(everyMinutes);
}

export function markWarned(
	record: SessionRecord,
	peerIds: readonly string[],
	now: Date,
): SessionRecord {
	if (peerIds.length === 0) return record;
	const warned: Record<string, string> = { ...(record.warned ?? {}) };
	for (const id of peerIds) warned[id] = now.toISOString();
	return { ...record, warned };
}

/**
 * Lets go of this session's hold on files: every recent edit, or those under
 * `under`. The holding session runs it (`/crew yield`) when it agrees a peer
 * may take over — the only way a hold ends early, and always its own decision.
 */
export function yieldEdits(
	record: SessionRecord,
	under?: string,
): SessionRecord {
	const keep = (path: string) =>
		under !== undefined && path !== under && !path.startsWith(`${under}/`);
	return { ...record, edits: record.edits.filter((e) => keep(e.path)) };
}
