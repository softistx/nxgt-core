/** Builders shared by the specs. */

import { type Peer, register, type SessionRecord } from './registry';
import { DEFAULT_SETTINGS } from './settings';

export const NOW = new Date('2026-09-27T12:00:00.000Z');
export const SETTINGS = DEFAULT_SETTINGS;

export const minutesAgo = (m: number) =>
	new Date(NOW.getTime() - m * 60_000).toISOString();

export function record(
	sessionId: string,
	fields: Partial<SessionRecord> = {},
): SessionRecord {
	return {
		...register(undefined, { sessionId, cwd: fields.cwd ?? '/' }, NOW),
		...fields,
	};
}

export const peer = (
	r: SessionRecord,
	liveness: Peer['liveness'] = 'active',
): Peer => ({
	record: r,
	liveness,
});
