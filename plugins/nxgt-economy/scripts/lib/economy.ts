/**
 * The token-economy rule and the two decisions built on it: what the
 * SessionStart hook says, and whether a spawned agent needs a reminder to pass
 * a model. Pure — every input is passed in — so the specs need no session.
 */

export type Env = Record<string, string | undefined>;

/** `NXGT_ECONOMY_DISABLE=1` (or `true`) turns the plugin off. */
export function disabled(env: Env): boolean {
	const value = env['NXGT_ECONOMY_DISABLE']?.trim().toLowerCase();
	return value === '1' || value === 'true';
}

const RULE = [
	"nxgt-economy: token economy. The main session should run on the strongest model; delegate light work to a lighter one with the Agent tool's `model` parameter. NXGT_ECONOMY_DISABLE=1 turns this off.",
	'- `haiku`: mechanical and read-only work — locating a file, symbol or log line; reading a log or CI output and reporting what failed; one question to a docs page; polling a status; listing, counting, comparing. It also writes mechanical code: a rename, a one-line fix with an exact spec, a mechanical edit.',
	'- `sonnet` (the subagent default when CLAUDE_CODE_SUBAGENT_MODEL=sonnet): implementation from a clear plan, writing or fixing specs, documentation, a review Sonnet can do (a small diff, a slice into feat/*, a docs or spec check), a multi-file search that needs judgement.',
	'- `opus`, passed explicitly: plans and architecture, every other review (always the deep review of a PR into develop), a bug of unknown cause, code Sonnet failed at or went in circles on, a decision costly to undo.',
	'- Opus plans and reviews, Sonnet and Haiku write the code; Opus writes code only when Sonnet really cannot, judged on the task: "Token economy" in ~/.claude/CLAUDE.md.',
	'- Bulk messages between sessions (the same send to several sessions) go to an agent with model: "sonnet": "Token economy" in ~/.claude/CLAUDE.md.',
	"- Don't spawn an agent for a single lookup one command does. Run independent agents in parallel, each with a self-contained prompt. Don't re-read a file you just edited. Never dump a whole log or transcript into context; filter it first.",
].join('\n');

const UNSET_NOTE =
	'nxgt-economy: CLAUDE_CODE_SUBAGENT_MODEL is not set, so subagents inherit the main model; the owner can set env.CLAUDE_CODE_SUBAGENT_MODEL=sonnet in ~/.claude/settings.json to make sonnet the default.';

/** The SessionStart context: the rule, plus a note when the subagent default is unset. */
export function buildRule(env: Env): string {
	return env['CLAUDE_CODE_SUBAGENT_MODEL']?.trim()
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
	if (args.subagent_type === 'Plan')
		return 'nxgt-economy: a Plan agent writes a plan, and every plan is Opus\'s ("Token economy" in ~/.claude/CLAUDE.md): pass model: "opus".';
	if (
		typeof args.subagent_type === 'string' &&
		(args.subagent_type === 'code-reviewer' ||
			args.subagent_type.endsWith(':code-reviewer'))
	)
		return 'nxgt-economy: a review takes a model ("Token economy" in ~/.claude/CLAUDE.md): pass model: "opus" for the deep review of a PR into develop and any review Sonnet cannot do, or model: "sonnet" for a small diff, a slice into feat/*, a docs or spec check.';
	const running =
		env['CLAUDE_CODE_SUBAGENT_MODEL']?.trim() || "the main session's model";
	return `nxgt-economy: this agent will run on ${running}, unless its definition pins a model. Pass model: "haiku" for mechanical work (a rename, a one-line fix with an exact spec) or a read-only lookup, model: "sonnet" for code or a review Sonnet can do, or model: "opus" for a plan, a deep review or a bug of unknown cause.`;
}
