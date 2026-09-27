/**
 * The registry's pure core: what a session record holds, when a peer counts as
 * live, and every change a hook makes to a record. No I/O here — `store.ts`
 * reads and writes the files, and the clock and the pid probe are passed in,
 * so each rule is a function a spec can call.
 *
 * A record never holds file contents or secrets: paths, a branch name, a
 * timestamp, and the one-line announcements a session chose to make.
 */

export type AnnouncementKind = 'working' | 'release' | 'decision' | 'note';

export interface Announcement {
	readonly text: string;
	readonly kind: AnnouncementKind;
	readonly at: string;
}

export interface Edit {
	readonly path: string;
	/** The git worktree the file belongs to, when it is in one. */
	readonly worktree?: string;
	readonly at: string;
}

export interface Claim {
	/** An absolute path this session owns: its scratch folder, a worktree it made. */
	readonly path: string;
	readonly note?: string;
	readonly at: string;
}

/** Where a directory sits in git. Every field is absent outside a repository. */
export interface GitPlace {
	/** `git rev-parse --show-toplevel`: the worktree root. */
	readonly worktree?: string;
	/** The absolute common git dir, shared by every worktree of one clone. */
	readonly repo?: string;
	/** `remote.origin.url`, which identifies two clones of one repository. */
	readonly remote?: string;
	/** Absent on a detached HEAD. */
	readonly branch?: string;
}

export interface SessionRecord extends GitPlace {
	readonly version: 1;
	readonly sessionId: string;
	readonly title?: string;
	/** The Claude Code process, when it could be identified; used to spot a crashed session. */
	readonly pid?: number;
	readonly cwd: string;
	readonly startedAt: string;
	readonly lastSeen: string;
	/** When the git place was last read, to throttle `git` calls. */
	readonly gitCheckedAt?: string;
	readonly edits: readonly Edit[];
	readonly claims: readonly Claim[];
	readonly announcements: readonly Announcement[];
	/** Peer announcements up to this instant were already shown to this session. */
	readonly seenUntil?: string;
	/** Per peer, when this session was last told it shares a worktree with it. */
	readonly warned?: Readonly<Record<string, string>>;
}

export interface Settings {
	/** A session silent this long, with no live process to vouch for it, is stale. */
	readonly staleMinutes: number;
	/** An edit older than this no longer holds its file. */
	readonly editWindowMinutes: number;
	/** A silent session whose process is alive still counts, up to this long. */
	readonly idleHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
	staleMinutes: 30,
	editWindowMinutes: 60,
	idleHours: 12,
};

export const LIMITS = {
	edits: 50,
	claims: 20,
	announcements: 20,
	announcementLength: 280,
} as const;

/**
 * `active`: seen within `staleMinutes`. `idle`: silent longer, but its process
 * is alive and it was seen within `idleHours` — it still owns its worktree.
 * `gone`: neither; its record is ignored and may be swept.
 */
export type Liveness = 'active' | 'idle' | 'gone';

/** `true` alive, `false` dead, `undefined` unknown (no pid, or no way to probe). */
export type PidProbe = (pid: number) => boolean | undefined;

const minutes = (n: number) => n * 60_000;

export function liveness(
	record: SessionRecord,
	now: Date,
	settings: Settings,
	probe: PidProbe,
): Liveness {
	const silence = now.getTime() - Date.parse(record.lastSeen);
	if (Number.isNaN(silence)) return 'gone';
	const alive = record.pid === undefined ? undefined : probe(record.pid);
	if (alive === false) return 'gone';
	if (silence <= minutes(settings.staleMinutes)) return 'active';
	if (alive === true && silence <= minutes(settings.idleHours * 60)) {
		return 'idle';
	}
	return 'gone';
}

export interface Peer {
	readonly record: SessionRecord;
	readonly liveness: Exclude<Liveness, 'gone'>;
}

/** Every other session that is still live, most recently seen first. */
export function livePeers(
	records: readonly SessionRecord[],
	selfId: string,
	now: Date,
	settings: Settings,
	probe: PidProbe,
): Peer[] {
	const peers: Peer[] = [];
	for (const record of records) {
		if (record.sessionId === selfId) continue;
		const state = liveness(record, now, settings, probe);
		if (state !== 'gone') peers.push({ record, liveness: state });
	}
	return peers.sort(
		(a, b) => Date.parse(b.record.lastSeen) - Date.parse(a.record.lastSeen),
	);
}

/** The records a sweep may delete: gone, and not this session's own. */
export function sweepable(
	records: readonly SessionRecord[],
	selfId: string,
	now: Date,
	settings: Settings,
	probe: PidProbe,
): string[] {
	return records
		.filter(
			(r) =>
				r.sessionId !== selfId && liveness(r, now, settings, probe) === 'gone',
		)
		.map((r) => r.sessionId);
}

/** Edits still inside the window. */
export function recentEdits(
	record: SessionRecord,
	now: Date,
	settings: Settings,
): Edit[] {
	const floor = now.getTime() - minutes(settings.editWindowMinutes);
	return record.edits.filter((e) => Date.parse(e.at) >= floor);
}

export interface Registration extends GitPlace {
	readonly sessionId: string;
	readonly cwd: string;
	readonly title?: string;
	readonly pid?: number;
	readonly scratchpad?: string;
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
		pid: input.pid ?? base.pid,
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
	update: { cwd?: string; place?: GitPlace } = {},
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

export function announce(
	record: SessionRecord,
	text: string,
	kind: AnnouncementKind,
	now: Date,
): SessionRecord {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (!clean) return record;
	const entry: Announcement = {
		text:
			clean.length > LIMITS.announcementLength
				? `${clean.slice(0, LIMITS.announcementLength - 1)}…`
				: clean,
		kind,
		at: now.toISOString(),
	};
	const announcements = [entry, ...record.announcements].slice(
		0,
		LIMITS.announcements,
	);
	return { ...record, announcements };
}

/** The latest `working` announcement: what the session says it is doing now. */
export function currentWork(record: SessionRecord): Announcement | undefined {
	return record.announcements.find((a) => a.kind === 'working');
}

export interface Unseen {
	readonly peer: SessionRecord;
	readonly announcement: Announcement;
}

/** Peer announcements made after `seenUntil`, oldest first. */
export function unseenAnnouncements(
	self: SessionRecord,
	peers: readonly Peer[],
): Unseen[] {
	const floor = self.seenUntil ? Date.parse(self.seenUntil) : 0;
	const out: Unseen[] = [];
	for (const { record } of peers) {
		for (const announcement of record.announcements) {
			if (Date.parse(announcement.at) > floor) {
				out.push({ peer: record, announcement });
			}
		}
	}
	return out.sort(
		(a, b) => Date.parse(a.announcement.at) - Date.parse(b.announcement.at),
	);
}

export function markSeen(record: SessionRecord, now: Date): SessionRecord {
	return { ...record, seenUntil: now.toISOString() };
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
		v.version === 1 &&
		typeof v.sessionId === 'string' &&
		typeof v.cwd === 'string' &&
		typeof v.lastSeen === 'string' &&
		Array.isArray(v.edits) &&
		Array.isArray(v.claims) &&
		Array.isArray(v.announcements)
	);
}

export function readSettings(
	env: Record<string, string | undefined>,
): Settings {
	const num = (key: string, fallback: number) => {
		const raw = env[key];
		if (raw === undefined || raw === '') return fallback;
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	};
	return {
		staleMinutes: num('NXGT_CREW_STALE_MINUTES', DEFAULT_SETTINGS.staleMinutes),
		editWindowMinutes: num(
			'NXGT_CREW_EDIT_WINDOW_MINUTES',
			DEFAULT_SETTINGS.editWindowMinutes,
		),
		idleHours: num('NXGT_CREW_IDLE_HOURS', DEFAULT_SETTINGS.idleHours),
	};
}
