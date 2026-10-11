#!/usr/bin/env bun
/**
 * SessionStart: show the package's open issues and the application's
 * adopt-ready tracking issues (see `lib/session-start.ts`). The only other
 * entry file, with `issues.ts`, that builds the real runner. Prints nothing
 * and exits 0 whenever there is nothing to say or anything fails.
 */

import { join } from 'node:path';
import { issuesHome } from '../lib/cache';
import { runHook } from '../lib/hook';
import { createRunner } from '../lib/runner';
import { sessionStartContext } from '../lib/session-start';

const issuesScript = join(import.meta.dir, '..', 'issues.ts');

await runHook('SessionStart', async (input) => {
	const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();
	const additionalContext = await sessionStartContext({
		runner: createRunner(),
		env: process.env,
		cwd,
		home: issuesHome(process.env),
		now: Date.now,
		refreshCommand: [process.execPath, issuesScript, 'refresh', '--cwd', cwd],
	});
	if (!additionalContext) return undefined;
	return {
		hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
	};
});
