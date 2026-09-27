#!/usr/bin/env bun
/**
 * SessionStart: put the autonomy mandate in Claude's context, in every session
 * that runs in a git repository. Outside one there is no queue to work and no
 * PR to open, so the hook prints nothing.
 */

import { existsSync } from 'node:fs';
import { runHook } from '../lib/hook';
import { buildMandate, insideGitRepo } from '../lib/mandate';

await runHook('SessionStart', (input) => {
	const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
	if (!insideGitRepo(cwd, existsSync)) return undefined;
	return {
		hookSpecificOutput: {
			hookEventName: 'SessionStart',
			additionalContext: buildMandate(),
		},
	};
});
