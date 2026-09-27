/**
 * What a session says to its peers: one-line announcements, the structured
 * `plan` kind, which ones a session has not seen yet, and which ones survive
 * the cap. Pure.
 */

import type {
	Announcement,
	AnnouncementKind,
	Peer,
	PlanFields,
	SessionRecord,
} from './registry';
import { LIMITS } from './settings';

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
	return {
		...record,
		announcements: keepAnnouncements([entry, ...record.announcements]),
	};
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

/** A validated plan: an announcement's `plan` fields, when they have the right shape. */
export interface Plan {
	readonly entry: string;
	readonly scope?: string;
	readonly needs?: readonly string[];
	readonly at: string;
	readonly text: string;
}

/**
 * The plan an announcement carries, or `undefined`. Records are written by
 * other sessions and read as untrusted data: an `entry` that is not a
 * non-empty string drops the plan, a `scope` that is not a string is ignored,
 * and `needs` keeps only its strings.
 */
export function planOf(a: Announcement): Plan | undefined {
	const raw = a as unknown as Record<string, unknown>;
	if (raw.kind !== 'plan') return undefined;
	const entry = raw.entry;
	if (typeof entry !== 'string' || !entry.trim()) return undefined;
	const scope =
		typeof raw.scope === 'string' && raw.scope.trim() ? raw.scope : undefined;
	const needs = Array.isArray(raw.needs)
		? raw.needs.filter(
				(n): n is string => typeof n === 'string' && n.trim() !== '',
			)
		: [];
	return {
		entry,
		at: typeof raw.at === 'string' ? raw.at : '',
		text: typeof raw.text === 'string' ? raw.text : '',
		...(scope ? { scope } : {}),
		...(needs.length ? { needs } : {}),
	};
}

/**
 * Newest first, capped at `LIMITS.announcements` — except that the latest plan
 * for each roadmap entry is kept however many announcements came after it. A
 * plan is a standing claim on an entry; twenty chatty notes must not erase it.
 * Older plans for the same entry are superseded and dropped first.
 */
export function keepAnnouncements(
	list: readonly Announcement[],
): Announcement[] {
	const sorted = [...list].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
	const latestPlan = new Set<Announcement>();
	const seen = new Set<string>();
	for (const a of sorted) {
		const plan = planOf(a);
		if (!plan) continue;
		const key = plan.entry.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		latestPlan.add(a);
	}
	const kept: Announcement[] = [];
	let others = 0;
	const room = Math.max(0, LIMITS.announcements - latestPlan.size);
	for (const a of sorted) {
		if (latestPlan.has(a)) kept.push(a);
		else if (a.kind !== 'plan' && others < room) {
			kept.push(a);
			others++;
		}
	}
	return kept;
}
