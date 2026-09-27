/**
 * The registry's pure core: what a session record holds, when a peer counts as
 * live, and every change a hook makes to a record. No I/O here — `store.ts`
 * reads and writes the files, and the clock and the pid probe are passed in,
 * so each rule is a function a spec can call.
 *
 * A record never holds file contents or secrets: paths, a branch name, a
 * timestamp, and the one-line announcements a session chose to make.
 */

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
}

/** The structured part of a `plan` announcement. */
export interface PlanFields {
	readonly entry?: string;
	readonly scope?: string;
	readonly needs?: readonly string[];
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
	/** That process's start time, so a reused pid is not mistaken for it. */
	readonly pidStart?: string;
	/** The machine the pid belongs to: a pid means nothing on another host or namespace. */
	readonly host?: string;
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

/**
 * Whether a record's process is still running: `true` alive, `false` dead,
 * `undefined` unknown (another host, or no way to probe). Called only for a
 * record that has a pid.
 */
export type PidProbe = (record: SessionRecord) => boolean | undefined;

const minutes = (n: number) => n * 60_000;

export function liveness(
	record: SessionRecord,
	now: Date,
	settings: Settings,
	probe: PidProbe,
): Liveness {
	const silence = now.getTime() - Date.parse(record.lastSeen);
	if (Number.isNaN(silence)) return 'gone';
	const alive = record.pid === undefined ? undefined : probe(record);
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
	readonly pidStart?: string;
	readonly host?: string;
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
	plan: PlanFields = {},
): SessionRecord {
	const clean = oneLine(text);
	if (!clean) return record;
	const needs = (plan.needs ?? []).map(oneLine).filter(Boolean).slice(0, 10);
	const entryTitle = plan.entry ? oneLine(plan.entry) : '';
	const scope = plan.scope ? oneLine(plan.scope) : '';
	const entry: Announcement = {
		text: clean,
		kind,
		at: now.toISOString(),
		...(kind === 'plan' && entryTitle ? { entry: entryTitle } : {}),
		...(kind === 'plan' && scope ? { scope } : {}),
		...(kind === 'plan' && needs.length ? { needs } : {}),
	};
	const announcements = [entry, ...record.announcements].slice(
		0,
		LIMITS.announcements,
	);
	return { ...record, announcements };
}

function oneLine(text: string): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > LIMITS.announcementLength
		? `${clean.slice(0, LIMITS.announcementLength - 1)}…`
		: clean;
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

const latest = (a: string | undefined, b: string | undefined) =>
	a === undefined
		? b
		: b === undefined
			? a
			: Date.parse(a) >= Date.parse(b)
				? a
				: b;

function unionBy<T extends { readonly at: string }>(
	a: readonly T[],
	b: readonly T[],
	key: (t: T) => string,
	cap: number,
): T[] {
	const byKey = new Map<string, T>();
	for (const item of [...a, ...b]) {
		const k = key(item);
		const seen = byKey.get(k);
		if (!seen || Date.parse(item.at) > Date.parse(seen.at)) byKey.set(k, item);
	}
	return [...byKey.values()]
		.sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
		.slice(0, cap);
}

/**
 * Folds what another hook of this same session wrote meanwhile into `next`.
 * Hooks run in parallel — an async PostToolUse still writing while the next
 * PreToolUse reads — so a plain last-writer-wins would drop an edit, and with
 * it the protection of that file. Edits, claims and announcements are unioned;
 * the rest is `next`'s, with the later timestamps kept.
 */
export function merge(
	onDisk: SessionRecord,
	next: SessionRecord,
): SessionRecord {
	const warned: Record<string, string> = { ...(onDisk.warned ?? {}) };
	for (const [id, at] of Object.entries(next.warned ?? {})) {
		warned[id] = latest(warned[id], at) as string;
	}
	return {
		...next,
		lastSeen: latest(onDisk.lastSeen, next.lastSeen) as string,
		seenUntil: latest(onDisk.seenUntil, next.seenUntil),
		warned,
		edits: unionBy(onDisk.edits, next.edits, (e) => e.path, LIMITS.edits),
		claims: unionBy(onDisk.claims, next.claims, (c) => c.path, LIMITS.claims),
		announcements: unionBy(
			onDisk.announcements,
			next.announcements,
			(a) => `${a.at} ${a.text}`,
			LIMITS.announcements,
		),
	};
}

/** "just now", "12 min ago", "3 h ago". */
export function ago(iso: string, now: Date): string {
	const m = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
	if (m < 1) return 'just now';
	if (m < 120) return `${m} min ago`;
	return `${Math.round(m / 60)} h ago`;
}

/** `true` when `path` is `parent` or lies under it. */
export function isInside(path: string, parent: string): boolean {
	if (path === parent) return true;
	const prefix = parent.endsWith('/') ? parent : `${parent}/`;
	return path.startsWith(prefix);
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
