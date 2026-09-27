#!/usr/bin/env bun
/**
 * SessionStart: register this session, sweep records of sessions that are
 * gone, export its id for the `/crew` CLI, and put a brief of the live peers
 * — same repository first — in Claude's context.
 */

import { appendFileSync } from 'node:fs';
import { brief } from '../lib/brief';
import { runHook } from '../lib/hook';
import { register, sweepable } from '../lib/registry';
import { load } from '../lib/session';
import { readAll, remove, write } from '../lib/store';
import { claudePid, gitPlace, probePid } from '../lib/system';

await runHook(async (input) => {
	const session = load(input, process.env, probePid);
	const cwd = input.cwd ?? session.self.cwd;
	const [place, pid] = await Promise.all([gitPlace(cwd), claudePid()]);
	const self = register(
		session.registered ? session.self : undefined,
		{
			sessionId: session.self.sessionId,
			cwd,
			title: input.session_title,
			pid,
			scratchpad: input.scratchpad_dir,
			...place,
		},
		session.now,
	);
	write(session.home, self);

	for (const id of sweepable(
		readAll(session.home),
		self.sessionId,
		session.now,
		session.settings,
		probePid,
	)) {
		remove(session.home, id);
	}

	const envFile = process.env.CLAUDE_ENV_FILE;
	if (envFile) {
		appendFileSync(
			envFile,
			`export NXGT_CREW_SESSION_ID='${self.sessionId.replace(/'/g, '')}'\n`,
		);
	}

	return {
		hookSpecificOutput: {
			hookEventName: 'SessionStart',
			additionalContext: brief(
				self,
				session.peers,
				session.now,
				session.settings,
			),
		},
	};
});
