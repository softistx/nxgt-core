#!/usr/bin/env bun

/**
 * PreToolUse on Edit, Write, NotebookEdit and Bash: the guard. It denies the
 * call when the conflict rules say another live session would be hurt, and
 * otherwise lets it through — adding, when there is something to know, who
 * shares this worktree and what peers announced since this session last looked.
 *
 * It never answers `allow`: that would skip the user's permission prompt. It
 * either says nothing, adds context, or denies.
 */

import { homedir } from 'node:os';
import { announce, markSeen, unseenAnnouncements } from '../lib/announcements';
import { evaluateBash } from '../lib/bash-rules';
import { digest } from '../lib/brief';
import { directoriesToResolve, parseCommand } from '../lib/command';
import { evaluateEdit, type Verdict } from '../lib/conflicts';
import { markWarned } from '../lib/holds';
import { runHook } from '../lib/hook';
import { load } from '../lib/session';
import { writeMerged } from '../lib/store';
import { gitPlace, placeResolver, probePid } from '../lib/system';
import { editedPath } from '../lib/tools';

await runHook(async (input) => {
	const session = load(input, process.env, probePid);
	const { self, peers, now, settings } = session;
	const ctx = { self, peers, now, settings };
	const cwd = input.cwd ?? self.cwd;

	let verdict: Verdict = { decision: 'allow', warned: [] };
	const file = editedPath(input.tool_name, input.tool_input);
	const command = input.tool_input?.['command'];
	if (file && peers.length) {
		verdict = evaluateEdit(file, await gitPlace(file), ctx);
	} else if (input.tool_name === 'Bash' && typeof command === 'string') {
		const ops = parseCommand(command, { cwd, home: homedir() });
		if (ops.length && (peers.length || ops.some((o) => o.kind === 'publish'))) {
			const placeOf = await placeResolver(directoriesToResolve(ops));
			verdict = evaluateBash(ops, placeOf, ctx);
		}
	}

	if (verdict.decision === 'deny') {
		return {
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason: verdict.reason,
			},
		};
	}

	const news = digest(unseenAnnouncements(self, peers), now);
	let next = markWarned(self, verdict.warned, now);
	if (news) next = markSeen(next, now);
	if (verdict.publish) next = announce(next, verdict.publish, 'release', now);
	if (next !== self || !session.registered) writeMerged(session.home, next);

	const context = [verdict.context, news].filter(Boolean).join('\n\n');
	return context
		? {
				hookSpecificOutput: {
					hookEventName: 'PreToolUse',
					additionalContext: context,
				},
			}
		: undefined;
});
