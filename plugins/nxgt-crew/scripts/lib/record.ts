/**
 * What a session record holds, how SessionStart creates it and the heartbeat
 * refreshes it, and how a record read from disk is recognised. Pure.
 *
 * A record never holds file contents or secrets: paths, a branch name, a
 * timestamp, and the one-line announcements a session chose to make.
 */

import { claim } from './holds';

export type AnnouncementKind =
	| 'working'
	| 'plan'
	| 'release'
	| 'decision'
	| 'note';

export interface Announcement {
	readonly text: string;
	readonly kind: AnnouncementKind;
	readonly at: string;
	/** `plan` only: the roadmap entry being planned or worked, as titled in docs/roadmap.md. */
	readonly entry?: string;
	/** `plan` only: the repository or package the entry belongs to (`nxgt-janus`, `@nxgt/janus-mail`). */
	readonly scope?: string;
	/** `plan` only: what the entry waits on (`@nxgt/mail@0.5.0`, `nxgt-mail`). */
	readonly needs?: readonly string[];
	/** `plan` only: a tombstone — the session withdrew its plan for this entry and scope. */
	readonly dropped?: true;
}

/** The structured part of a `plan` announcement. */
export interface PlanFields {
	readonly entry?: string;
	readonly scope?: string;
	readonly needs?: readonly string[];
	/** A tombstone: the session withdrew its plan for this entry and scope. */
	readonly dropped?: boolean;
}

export interface Edit {
	readonly path: string;
	/** The git worktree the file belongs to, when it is in one. */
	readonly worktree?: string | undefined;
	readonly at: string;
}

export interface Claim {
	/** An absolute path this session owns: its scratch folder, a worktree it made. */
	readonly path: string;
	readonly note?: string | undefined;
	readonly at: string;
}

/** Where a directory sits in git. Every field is absent outside a repository. */
export interface GitPlace {
	/** `git rev-parse --show-toplevel`: the worktree root. */
	readonly worktree?: string | undefined;
	/** The absolute common git dir, shared by every worktree of one clone. */
	readonly repo?: string | undefined;
	/** `remote.origin.url`, which identifies two clones of one repository. */
	readonly remote?: string | undefined;
	/** Absent on a detached HEAD. */
	readonly branch?: string | undefined;
}

export interface SessionRecord extends GitPlace {
	readonly version: 1;
	readonly sessionId: string;
	readonly title?: string | undefined;
	/** The Claude Code process, when it could be identified; used to spot a crashed session. */
	readonly pid?: number | undefined;
	/** That process's start time, so a reused pid is not mistaken for it. */
	readonly pidStart?: string | undefined;
	/** The machine the pid belongs to: a pid means nothing on another host or namespace. */
	readonly host?: string | undefined;
	readonly cwd: string;
	readonly startedAt: string;
	readonly lastSeen: string;
	/** When the git place was last read, to throttle `git` calls. */
	readonly gitCheckedAt?: string | undefined;
	readonly edits: readonly Edit[];
	readonly claims: readonly Claim[];
	readonly announcements: readonly Announcement[];
	/** Peer announcements up to this instant were already shown to this session. */
	readonly seenUntil?: string | undefined;
	/** Per peer, when this session was last told it shares a worktree with it. */
	readonly warned?: Readonly<Record<string, string>> | undefined;
}

export interface Registration extends GitPlace {
	readonly sessionId: string;
	readonly cwd: string;
	readonly title?: string | undefined;
	readonly pid?: number | undefined;
	readonly pidStart?: string | undefined;
	readonly host?: string | undefined;
	readonly scratchpad?: string | undefined;
}

/**
 * The record SessionStart writes. A resumed or compacted session keeps what it
 * had — its edits, claims and announcements — and refreshes the rest.
 */
export function register(
	previous: SessionRecord | undefined,
	input: Registration,
	now: Date,
): SessionRecord {
	const at = now.toISOString();
	const base: SessionRecord = previous ?? {
		version: 1,
		sessionId: input.sessionId,
		cwd: input.cwd,
		startedAt: at,
		lastSeen: at,
		edits: [],
		claims: [],
		announcements: [],
		seenUntil: at,
	};
	const next: SessionRecord = {
		...base,
		cwd: input.cwd,
		title: input.title ?? base.title,
		pid: input.pid,
		pidStart: input.pidStart,
		host: input.host,
		worktree: input.worktree,
		repo: input.repo,
		remote: input.remote,
		branch: input.branch,
		gitCheckedAt: at,
		lastSeen: at,
	};
	return input.scratchpad
		? claim(next, input.scratchpad, 'scratchpad', now)
		: next;
}

export function heartbeat(
	record: SessionRecord,
	now: Date,
	update: { cwd?: string | undefined; place?: GitPlace | undefined } = {},
): SessionRecord {
	const at = now.toISOString();
	const next: SessionRecord = {
		...record,
		cwd: update.cwd ?? record.cwd,
		lastSeen: at,
	};
	if (!update.place) return next;
	return {
		...next,
		worktree: update.place.worktree,
		repo: update.place.repo,
		remote: update.place.remote,
		branch: update.place.branch,
		gitCheckedAt: at,
	};
}

/** Whether the git place is old enough to read again. */
export function gitIsStale(
	record: SessionRecord,
	now: Date,
	seconds = 60,
): boolean {
	if (!record.gitCheckedAt) return true;
	return now.getTime() - Date.parse(record.gitCheckedAt) > seconds * 1000;
}

/** A short, human name for a peer: its title, else the first eight characters of its id. */
export function label(record: SessionRecord): string {
	return record.title?.trim() || record.sessionId.slice(0, 8);
}

/**
 * Whether a parsed JSON value is a record this version can read. Anything else
 * is skipped, never trusted: the registry is shared by every session.
 */
export function isRecord(value: unknown): value is SessionRecord {
	if (typeof value !== 'object' || value === null) return false;
	const v = value as Record<string, unknown>;
	return (
		v['version'] === 1 &&
		typeof v['sessionId'] === 'string' &&
		typeof v['cwd'] === 'string' &&
		typeof v['lastSeen'] === 'string' &&
		Array.isArray(v['edits']) &&
		Array.isArray(v['claims']) &&
		Array.isArray(v['announcements'])
	);
}
