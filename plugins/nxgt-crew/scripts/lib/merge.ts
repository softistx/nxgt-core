/**
 * Folding parallel writes of one session's record. Pure.
 */

import { keepAnnouncements } from './announcements';
import type { SessionRecord } from './record';
import { LIMITS } from './settings';
import { latest } from './time';

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
		announcements: keepAnnouncements(
			unionBy(
				onDisk.announcements,
				next.announcements,
				(a) => `${a.at} ${a.text}`,
				Number.POSITIVE_INFINITY,
			),
		),
	};
}
