#!/usr/bin/env bun

/**
 * PostToolUse, run with `async: true` so it never delays a tool: the heartbeat
 * on tool use. It records the file an Edit, Write or NotebookEdit touched,
 * re-reads the git place after a Bash command (which may have switched
 * branch), and claims the folders a `mktemp -d` printed.
 */

import { statSync } from 'node:fs';
import { claim, recordEdit } from '../lib/holds';
import { runHook } from '../lib/hook';
import { isInside } from '../lib/paths';
import { gitIsStale, heartbeat } from '../lib/record';
import { load, type Session } from '../lib/session';
import { writeMerged } from '../lib/store';
import { gitPlace, probePid } from '../lib/system';
import { claimsFromMktemp, editedPath } from '../lib/tools';

/**
 * A printed path is claimed only if it is a folder created in the last two
 * minutes that no live peer already stands in or claims — so a command that
 * mentions `mktemp` and also lists other sessions' folders claims none of them.
 */
function isFreshFolder(path: string, session: Session): boolean {
	try {
		const st = statSync(path);
		if (!st.isDirectory()) return false;
		const born = st.birthtimeMs || st.ctimeMs;
		if (session.now.getTime() - born > 120_000) return false;
	} catch {
		return false;
	}
	return !session.peers.some(
		({ record }) =>
			isInside(path, record.cwd) ||
			(record.worktree !== undefined && isInside(path, record.worktree)) ||
			record.claims.some((c) => isInside(path, c.path)),
	);
}

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
		const printed = claimsFromMktemp(input.tool_input, input.tool_response);
		for (const path of printed.filter((p) => isFreshFolder(p, session))) {
			self = claim(self, path, 'mktemp', session.now);
		}
	}
	writeMerged(session.home, self);
	return undefined;
});
