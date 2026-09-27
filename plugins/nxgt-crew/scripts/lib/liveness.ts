/**
 * When a peer counts as live. The clock and the pid probe are passed in, so
 * each rule is a function a spec can call.
 */

import type { SessionRecord } from './record';
import type { Settings } from './settings';
import { minutes } from './time';

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
