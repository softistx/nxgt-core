/**
 * The `plan` announcement read back: validated, keyed like the alignment pass
 * keys roadmap entries, and resolved to the latest word per entry — a later
 * plan supersedes an earlier one, and a tombstone (`--drop`) withdraws it.
 * Records are written by other sessions and read as untrusted data. Pure.
 */

import type { Announcement, SessionRecord } from './record';
import { entryKey } from './roadmap';
import { scopeKey } from './scope';

/** A validated plan: an announcement's `plan` fields, when they have the right shape. */
export interface Plan {
	readonly entry: string;
	readonly scope?: string;
	readonly needs?: readonly string[];
	readonly at: string;
	readonly text: string;
	/** A tombstone: the plan for this entry and scope is withdrawn. */
	readonly dropped?: true;
}

const trimmed = (value: unknown): string =>
	typeof value === 'string' ? value.trim() : '';

/**
 * The plan an announcement carries, or `undefined`. An `entry` that is not a
 * non-empty string, or an `at` that is not a readable date, drops the plan; a
 * `scope` that is not a string is ignored, and `needs` keeps only its
 * non-empty strings. Every string is trimmed.
 */
export function planOf(a: Announcement): Plan | undefined {
	const raw = a as unknown as Record<string, unknown>;
	if (raw.kind !== 'plan') return undefined;
	const entry = trimmed(raw.entry);
	if (!entry) return undefined;
	const at = trimmed(raw.at);
	if (!at || Number.isNaN(Date.parse(at))) return undefined;
	const scope = trimmed(raw.scope);
	const needs = Array.isArray(raw.needs)
		? raw.needs.map(trimmed).filter(Boolean)
		: [];
	return {
		entry,
		at,
		text: trimmed(raw.text),
		...(scope ? { scope } : {}),
		...(needs.length ? { needs } : {}),
		...(raw.dropped === true ? { dropped: true as const } : {}),
	};
}

/**
 * A plan's identity: its scope and its entry, each normalised the way the
 * alignment pass normalises them — so `**Mail**` in `nxgt-janus` and `mail` in
 * `NXGT-Janus` are one plan, and the same title in two packages is two.
 */
export function planKey(plan: Pick<Plan, 'entry' | 'scope'>): string {
	return JSON.stringify([scopeKey(plan.scope ?? ''), entryKey(plan.entry)]);
}

/** Newest first; the `at` of every plan is readable, `planOf` saw to it. */
const newestFirst = (x: Plan, y: Plan) => Date.parse(y.at) - Date.parse(x.at);

/**
 * The plans a session stands by: the latest per `planKey`, unless that latest
 * is a tombstone. Malformed announcements are dropped, never trusted.
 */
export function plansOf(record: SessionRecord): Plan[] {
	const plans = record.announcements.flatMap((a) => {
		const plan = planOf(a);
		return plan ? [plan] : [];
	});
	const seen = new Set<string>();
	const out: Plan[] = [];
	for (const plan of plans.sort(newestFirst)) {
		const key = planKey(plan);
		if (seen.has(key)) continue;
		seen.add(key);
		if (!plan.dropped) out.push(plan);
	}
	return out;
}
