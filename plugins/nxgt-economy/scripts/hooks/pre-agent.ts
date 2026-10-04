#!/usr/bin/env bun
/**
 * PreToolUse on Agent: when the call names no model, add a one-line reminder
 * next to the tool call. No permissionDecision and no updatedInput — the call
 * proceeds exactly as written.
 */

import { agentReminder, type ToolInput } from '../lib/economy';
import { runHook } from '../lib/hook';

await runHook('PreToolUse', (input) => {
	const reminder = agentReminder(input as ToolInput, process.env);
	if (!reminder) return undefined;
	return {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			additionalContext: reminder,
		},
	};
});
