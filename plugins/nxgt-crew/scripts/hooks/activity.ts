#!/usr/bin/env bun
/**
 * PostToolUse, run with `async: true` so it never delays a tool: the heartbeat
 * on tool use. It records the file an Edit, Write or NotebookEdit touched,
 * re-reads the git place after a Bash command (which may have switched
 * branch), and claims the folders a `mktemp -d` printed.
 */

import { runHook } from '../lib/hook';
import { claim, gitIsStale, heartbeat, recordEdit } from '../lib/registry';
import { load } from '../lib/session';
import { write } from '../lib/store';
import { gitPlace, probePid } from '../lib/system';
import { claimsFromMktemp, editedPath } from '../lib/tools';

await runHook(async (input) => {
	const session = load(input, process.env, probePid);
	const cwd = input.cwd ?? session.self.cwd;
	const isBash = input.tool_name === 'Bash';
	const place =
		isBash || gitIsStale(session.self, session.now) || cwd !== session.self.cwd
			? await gitPlace(cwd)
			: undefined;
	let self = heartbeat(session.self, session.now, { cwd, place });

	const file = editedPath(input.tool_name, input.tool_input);
	if (file) {
		const fileWorktree = (await gitPlace(file)).worktree;
		self = recordEdit(self, file, fileWorktree, session.now);
	}
	if (isBash) {
		for (const path of claimsFromMktemp(
			input.tool_input,
			input.tool_response,
		)) {
			self = claim(self, path, 'mktemp', session.now);
		}
	}
	write(session.home, self);
	return undefined;
});
