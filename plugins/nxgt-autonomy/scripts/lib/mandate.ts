/**
 * The autonomy mandate the SessionStart hook puts in Claude's context, and the
 * two facts that decide whether it is sent: the opt-out, and whether the
 * session is in a git repository. Pure — every input is passed in — so the
 * specs need no session.
 */

export type Env = Record<string, string | undefined>;

/** `NXGT_AUTONOMY_DISABLE=1` (or `true`) turns the hook off. */
export function disabled(env: Env): boolean {
	const value = env['NXGT_AUTONOMY_DISABLE']?.trim().toLowerCase();
	return value === '1' || value === 'true';
}

/**
 * Whether the working directory sits in a git repository: a `.git` entry (a
 * directory, or the file a worktree has) in it or in any parent. No spawn —
 * this runs on every session start.
 */
export function insideGitRepo(
	cwd: string,
	exists: (path: string) => boolean,
): boolean {
	if (!cwd.startsWith('/')) return false;
	let dir = cwd.replace(/\/+$/, '') || '/';
	for (;;) {
		if (exists(dir === '/' ? '/.git' : `${dir}/.git`)) return true;
		if (dir === '/') return false;
		dir = dir.slice(0, dir.lastIndexOf('/')) || '/';
	}
}

/** The mandate itself: a few lines, and a pointer to the skill that details it. */
export function buildMandate(): string {
	return [
		'nxgt-autonomy: autonomous mode is the default for this session. The skill nxgt-autonomy:work-autonomously details it; NXGT_AUTONOMY_DISABLE=1 turns it off.',
		'- Work the queue (the work-queue.md memory file) to completion. When it runs dry, run the queue-refiller if the owner said to keep going, else the improvement-scout, then nxgt-autonomy:plan-the-roadmap. Never start work the queue does not approve.',
		'- Owner decisions go through AskUserQuestion, recommended option first and labelled "(Recommended)" or "(Recommandé)". Do all the work that does not depend on the answer before asking. A question that returns unanswered after 5 minutes (askUserQuestionTimeout "5m") goes to the unanswered-question-resolver.',
		"- An irreversible or outward-facing action — deleting data, force-pushing, a first publish of a package, spending money, messaging anyone off this machine — waits for the owner's explicit answer; carry on with other work meanwhile.",
		'- Never end a turn by handing back or waiting.',
		"- Every PR goes through nxgt-review:review-before-a-pr, then nxgt-docs:keep-docs-current. Merges and releases follow the repository's AGENTS.md.",
	].join('\n');
}
