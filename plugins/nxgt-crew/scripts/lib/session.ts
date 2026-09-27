/**
 * What every hook starts from: this session's record (created on the spot when
 * SessionStart never ran for it, e.g. the plugin was enabled mid-session), its
 * live peers, the clock and the settings.
 */

import type { SessionInput } from './hook';
import {
	livePeers,
	type Peer,
	type PidProbe,
	register,
	type SessionRecord,
} from './registry';
import { readSettings, type Settings } from './settings';
import { crewHome, readAll } from './store';

export interface Session {
	readonly home: string;
	readonly self: SessionRecord;
	/** Whether `self` came from disk, as opposed to being made up just now. */
	readonly registered: boolean;
	readonly peers: Peer[];
	readonly now: Date;
	readonly settings: Settings;
}

export function load(
	input: SessionInput,
	env: Record<string, string | undefined>,
	probe: PidProbe,
	now = new Date(),
): Session {
	const home = crewHome(env);
	const settings = readSettings(env);
	const sessionId = input.session_id;
	const records = readAll(home);
	const found = records.find((r) => r.sessionId === sessionId);
	const self =
		found ?? register(undefined, { sessionId, cwd: input.cwd ?? '/' }, now);
	return {
		home,
		self,
		registered: found !== undefined,
		peers: livePeers(records, sessionId, now, settings, probe),
		now,
		settings,
	};
}
