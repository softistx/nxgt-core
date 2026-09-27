/**
 * What a session says to its peers: one-line announcements, the structured
 * `plan` kind (read back in `plans.ts`), which ones a session has not seen
 * yet, and which ones survive the caps. Pure.
 */

import type { Peer } from './liveness';
import { planKey, planOf } from './plans';
import type {
	Announcement,
	AnnouncementKind,
	PlanFields,
	SessionRecord,
} from './record';
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
	const isPlan = kind === 'plan' && entryTitle !== '';
	const entry: Announcement = {
		text: clean,
		kind,
		at: now.toISOString(),
		...(isPlan ? { entry: entryTitle } : {}),
		...(isPlan && scope ? { scope } : {}),
		...(isPlan && needs.length && !plan.dropped ? { needs } : {}),
		...(isPlan && plan.dropped ? { dropped: true as const } : {}),
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

/** Newest first; an unreadable `at` sorts last. */
function newestFirst(list: readonly Announcement[]): Announcement[] {
	const time = (a: Announcement) => {
		const t = Date.parse(a.at);
		return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
	};
	return [...list].sort((x, y) => time(y) - time(x));
}

/** The latest plan (or tombstone) per `planKey`, newest first, at most `LIMITS.plans`. */
function standingPlans(sorted: readonly Announcement[]): Set<Announcement> {
	const kept = new Set<Announcement>();
	const seen = new Set<string>();
	for (const a of sorted) {
		const plan = planOf(a);
		if (!plan) continue;
		const key = planKey(plan);
		if (seen.has(key)) continue;
		seen.add(key);
		if (kept.size < LIMITS.plans) kept.add(a);
	}
	return kept;
}

/** The latest `working` and the latest `LIMITS.releases` releases: never crowded out. */
function reserved(sorted: readonly Announcement[]): Set<Announcement> {
	const kept = new Set<Announcement>();
	const working = sorted.find((a) => a.kind === 'working');
	if (working) kept.add(working);
	for (const a of sorted
		.filter((a) => a.kind === 'release')
		.slice(0, LIMITS.releases)) {
		kept.add(a);
	}
	return kept;
}

/**
 * Newest first, with two budgets. Plans have their own: the latest per entry
 * and scope (`planKey`), a tombstone included, up to `LIMITS.plans` — a plan
 * is a standing claim, and twenty chatty notes must not erase it. Everything
 * else shares `LIMITS.announcements`, of which the latest `working` and the
 * latest releases are always kept, so a full plan budget never silences what
 * a session is doing now or what it shipped.
 */
export function keepAnnouncements(
	list: readonly Announcement[],
): Announcement[] {
	const sorted = newestFirst(list);
	const plans = standingPlans(sorted);
	const others = reserved(sorted);
	for (const a of sorted) {
		if (others.size >= LIMITS.announcements) break;
		if (a.kind !== 'plan') others.add(a);
	}
	return sorted.filter((a) => plans.has(a) || others.has(a));
}
