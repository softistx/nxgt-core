/**
 * The token-economy rule and the two decisions built on it: what the
 * SessionStart hook says, and whether a spawned agent needs a reminder to pass
 * a model. Pure — every input is passed in — so the specs need no session.
 */

export type Env = Record<string, string | undefined>;

/** `NXGT_ECONOMY_DISABLE=1` (or `true`) turns the plugin off. */
export function disabled(env: Env): boolean {
	const value = env.NXGT_ECONOMY_DISABLE?.trim().toLowerCase();
	return value === '1' || value === 'true';
}

const RULE = [
	"nxgt-economy: token economy. The main session should run on the strongest model; delegate light work to a lighter one with the Agent tool's `model` parameter. NXGT_ECONOMY_DISABLE=1 turns this off.",
	'- `haiku`: mechanical and read-only work — locating a file, symbol or log line; reading a log or CI output and reporting what failed; one question to a docs page; polling a status; listing, counting, comparing; a rename or one-line fix with an exact spec.',
	'- `sonnet` (the subagent default when CLAUDE_CODE_SUBAGENT_MODEL=sonnet): implementation from a clear plan, writing or fixing specs, documentation, read-only review of a small diff, a multi-file search that needs judgement.',
	'- `opus`, passed explicitly: architecture and plans, a hard bug of unknown cause, the review before a PR into develop, anything costly to undo.',
	"- Don't spawn an agent for a single lookup one command does. Run independent agents in parallel, each with a self-contained prompt. Don't re-read a file you just edited. Never dump a whole log or transcript into context; filter it first.",
].join('\n');

const UNSET_NOTE =
	'nxgt-economy: CLAUDE_CODE_SUBAGENT_MODEL is not set, so subagents inherit the main model; the owner can set env.CLAUDE_CODE_SUBAGENT_MODEL=sonnet in ~/.claude/settings.json to make sonnet the default.';

/** The SessionStart context: the rule, plus a note when the subagent default is unset. */
export function buildRule(env: Env): string {
	return env.CLAUDE_CODE_SUBAGENT_MODEL?.trim()
		? RULE
		: `${RULE}\n${UNSET_NOTE}`;
}

export interface ToolInput {
	readonly tool_name?: string;
	readonly tool_input?: {
		readonly model?: unknown;
		readonly subagent_type?: unknown;
	};
}

/**
 * The PreToolUse reminder for an Agent call that names no model, or undefined
 * when there is nothing to say: another tool, a model already passed, or a
 * fork (which always runs on the main model).
 */
export function agentReminder(input: ToolInput, env: Env): string | undefined {
	if (input.tool_name !== 'Agent') return undefined;
	const args = input.tool_input ?? {};
	if (typeof args.model === 'string' && args.model.trim()) return undefined;
	if (args.subagent_type === 'fork') return undefined;
	const running =
		env.CLAUDE_CODE_SUBAGENT_MODEL?.trim() || "the main session's model";
	return `nxgt-economy: this agent will run on ${running}, unless its definition pins a model. Pass model: "haiku" for mechanical or read-only work, or model: "opus" for architecture, a hard bug or the review before a PR.`;
}
