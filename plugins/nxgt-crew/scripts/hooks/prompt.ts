#!/usr/bin/env bun

/**
 * UserPromptSubmit: the heartbeat that also reads the news. It marks this
 * session as seen, refreshes its git place when that is over a minute old, and
 * puts announcements peers made since the last prompt — a release, a decision —
 * in Claude's context next to the prompt.
 */

import { markSeen, unseenAnnouncements } from '../lib/announcements';
import { digest } from '../lib/brief';
import { runHook } from '../lib/hook';
import { gitIsStale, heartbeat } from '../lib/registry';
import { load } from '../lib/session';
import { writeMerged } from '../lib/store';
import { gitPlace, probePid } from '../lib/system';

await runHook(async (input) => {
	const session = load(input, process.env, probePid);
	const cwd = input.cwd ?? session.self.cwd;
	const place =
		gitIsStale(session.self, session.now) || cwd !== session.self.cwd
			? await gitPlace(cwd)
			: undefined;
	const news = digest(
		unseenAnnouncements(session.self, session.peers),
		session.now,
	);
	writeMerged(
		session.home,
		markSeen(heartbeat(session.self, session.now, { cwd, place }), session.now),
	);
	return news
		? {
				hookSpecificOutput: {
					hookEventName: 'UserPromptSubmit',
					additionalContext: news,
				},
			}
		: undefined;
});
