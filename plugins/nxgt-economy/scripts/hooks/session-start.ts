#!/usr/bin/env bun
/** SessionStart: put the token-economy rule in Claude's context. */

import { buildRule } from '../lib/economy';
import { runHook } from '../lib/hook';

await runHook('SessionStart', () => ({
	hookSpecificOutput: {
		hookEventName: 'SessionStart',
		additionalContext: buildRule(process.env),
	},
}));
