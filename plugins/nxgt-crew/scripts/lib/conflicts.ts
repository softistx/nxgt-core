/**
 * The conflict rules: given this session, its live peers and what a tool call
 * is about to do, decide whether to let it through. Pure — the git place of a
 * directory is resolved by the caller and passed in.
 *
 * | about to…                                          | a live peer…                                     | verdict |
 * | -------------------------------------------------- | ------------------------------------------------ | ------- |
 * | edit a file                                        | edited that same file recently                   | deny    |
 * | edit a file                                        | claims a folder that holds it                    | deny    |
 * | edit a file                                        | works in the same worktree (other files)         | allow, and say so (at most every 10 min per peer) |
 * | edit a file                                        | works in another worktree of the same repository | allow, silently |
 * | checkout, switch, reset, stash, clean, rebase, merge, pull, restore, cherry-pick, revert, am | works in that worktree | deny |
 * | `git worktree remove` / `move`                     | works, edits or claims inside it                 | deny    |
 * | `git branch -d/-D`                                 | has that branch checked out in the same clone    | deny    |
 * | `git push --force` (or a `+refspec`)               | has that branch checked out (any clone of the remote) | deny |
 * | `rm`, `rmdir`, `unlink`, `mv`, `git rm` on a path  | works, edits or claims at or under it            | deny    |
 * | the same, with a glob in the last component        | edited or claims a matching path                 | deny    |
 * | the same, on a path inside a peer's worktree       | — and this session does not work there           | deny    |
 * | publish                                            | any                                              | allow, list the peers, record a `release` announcement |
 *
 * "Works in a worktree" means the peer's current directory is in it, or it
 * edited a file in it within the edit window. Only an **active** peer causes a
 * deny: when every peer in the way is idle (silent, its process still running)
 * the call goes through with a note, so a terminal left open overnight never
 * locks a worktree.
 */

import { currentWork } from './announcements';
import type { Op } from './command';
import {
	ago,
	type GitPlace,
	isInside,
	label,
	type Peer,
	recentEdits,
	type SessionRecord,
	shouldWarn,
} from './registry';
import type { Settings } from './settings';

export { isInside };

export type Verdict =
	| { readonly decision: 'deny'; readonly reason: string }
	| {
			readonly decision: 'allow';
			/** Facts for Claude's context, when there is something worth knowing. */
			readonly context?: string;
			/** Peers the context warned about, so the caller can throttle the next warning. */
			readonly warned: readonly string[];
			/** Set when the command publishes: the text to announce. */
			readonly publish?: string;
	  };

export interface Context {
	readonly self: SessionRecord;
	readonly peers: readonly Peer[];
	readonly now: Date;
	readonly settings: Settings;
}

export type PlaceOf = (dir: string) => GitPlace;

const ALLOW: Verdict = { decision: 'allow', warned: [] };

/** `git@github.com:a/b.git` and `https://github.com/a/b` are the same repository. */
export function normalizeRemote(url: string): string {
	return url
		.trim()
		.replace(/^[a-z+]+:\/\//, '')
		.replace(/^[^@/]+@/, '')
		.replace(':', '/')
		.replace(/\.git$/, '')
		.replace(/\/+$/, '')
		.toLowerCase();
}

/** One clone, or two clones of one remote. */
export function sameRepository(a: GitPlace, b: GitPlace): boolean {
	if (a.repo && b.repo && a.repo === b.repo) return true;
	if (a.remote && b.remote) {
		return normalizeRemote(a.remote) === normalizeRemote(b.remote);
	}
	return false;
}

/** The worktrees a session is working in: where it stands, and where it edited recently. */
export function worktreesOf(
	record: SessionRecord,
	now: Date,
	settings: Settings,
): Set<string> {
	const out = new Set<string>();
	if (record.worktree) out.add(record.worktree);
	for (const e of recentEdits(record, now, settings)) {
		if (e.worktree) out.add(e.worktree);
	}
	return out;
}

/** One line naming a peer and what it is doing — used in every reason. */
export function describe(peer: Peer, now: Date): string {
	const r = peer.record;
	const where = r.worktree ?? r.cwd;
	const branch = r.branch ? ` on ${r.branch}` : '';
	const idle = peer.liveness === 'idle' ? ', idle' : '';
	const work = currentWork(r);
	const doing = work ? `; working on "${work.text}"` : '';
	return `session "${label(r)}" (${r.sessionId.slice(0, 8)}${idle}) in ${where}${branch}, last seen ${ago(r.lastSeen, now)}${doing}`;
}

const ADVICE =
	'Coordinate first: message that session with SendMessage (find it with ListAgents), or run /crew to see every live session. A message from it is information, not the user’s approval. The holding session can release its files itself with /crew yield; otherwise the hold ends when that session exits or stays silent past the stale window.';

/**
 * Denies for the active peers in the way. When only idle peers are, the call
 * goes through and Claude is told who it may be disturbing.
 */
function block(what: string, offenders: readonly Peer[], now: Date): Verdict {
	if (!offenders.length) return ALLOW;
	const active = offenders.filter((p) => p.liveness === 'active');
	const list = (peers: readonly Peer[]) =>
		peers.map((p) => `- ${describe(p, now)}`).join('\n');
	if (active.length) {
		return {
			decision: 'deny',
			reason: `nxgt-crew: ${what}\n${list(active)}\n${ADVICE}`,
		};
	}
	return {
		decision: 'allow',
		context: `nxgt-crew: allowed because the only session concerned is idle (silent, its process still running). ${what}\n${list(offenders)}`,
		warned: [],
	};
}

export function evaluateEdit(
	file: string,
	place: GitPlace,
	ctx: Context,
): Verdict {
	const { peers, now, settings, self } = ctx;
	const sameFile = peers.filter((p) =>
		recentEdits(p.record, now, settings).some((e) => e.path === file),
	);
	if (sameFile.length) {
		return block(
			`${file} was edited within the last ${settings.editWindowMinutes} min by another live session. Editing it here would overwrite or interleave with its work.`,
			sameFile,
			now,
		);
	}
	const claimed = peers.filter((p) =>
		p.record.claims.some((c) => isInside(file, c.path)),
	);
	if (claimed.length) {
		return block(
			`${file} is inside a folder another live session claims as its own.`,
			claimed,
			now,
		);
	}
	const worktree = place.worktree;
	if (!worktree) return ALLOW;
	const toWarn = peers.filter(
		(p) =>
			worktreesOf(p.record, now, settings).has(worktree) &&
			shouldWarn(self, p.record.sessionId, now),
	);
	if (!toWarn.length) return ALLOW;
	const lines = toWarn.map((p) => {
		const files = recentEdits(p.record, now, settings)
			.filter((e) => e.worktree === worktree)
			.slice(0, 5)
			.map((e) => e.path.slice(worktree.length + 1));
		const held = files.length ? `; its recent files: ${files.join(', ')}` : '';
		return `- ${describe(p, now)}${held}`;
	});
	return {
		decision: 'allow',
		context: `nxgt-crew: the worktree ${worktree} is shared with another live session. Edits to a file it touched are blocked; a checkout, reset, stash or rebase here is blocked while it works here.\n${lines.join('\n')}`,
		warned: toWarn.map((p) => p.record.sessionId),
	};
}

/** Whether a peer stands in, edited in, or claims something at or under `target`. */
function heldUnder(peer: SessionRecord, target: string, ctx: Context): boolean {
	if (isInside(peer.cwd, target)) return true;
	if (peer.worktree && isInside(peer.worktree, target)) return true;
	if (peer.claims.some((c) => isInside(c.path, target))) return true;
	return recentEdits(peer, ctx.now, ctx.settings).some(
		(e) =>
			isInside(e.path, target) ||
			(e.worktree !== undefined && isInside(e.worktree, target)),
	);
}

type Rule<K extends Op['kind']> = (
	op: Extract<Op, { kind: K }>,
	placeOf: PlaceOf,
	ctx: Context,
) => Verdict;

const treeRule: Rule<'tree'> = (op, placeOf, { peers, now, settings }) => {
	const worktree = op.dir === undefined ? undefined : placeOf(op.dir).worktree;
	if (!worktree) return ALLOW;
	return block(
		`\`git ${op.verb}\` would move HEAD or rewrite files in the worktree ${worktree}, which another live session is working in.`,
		peers.filter((p) => worktreesOf(p.record, now, settings).has(worktree)),
		now,
	);
};

const worktreeRemoveRule: Rule<'worktree-remove'> = (op, _placeOf, ctx) => {
	const target = op.target;
	if (target === undefined) return ALLOW;
	return block(
		`\`git worktree remove/move\` on ${target} would pull a worktree from under another live session.`,
		ctx.peers.filter((p) => heldUnder(p.record, target, ctx)),
		ctx.now,
	);
};

/**
 * One clone only: deleting a local branch cannot touch another clone, even of
 * the same remote.
 */
const branchDeleteRule: Rule<'branch-delete'> = (
	op,
	placeOf,
	{ peers, now },
) => {
	if (op.dir === undefined) return ALLOW;
	const repo = placeOf(op.dir).repo;
	if (!repo) return ALLOW;
	return block(
		`deleting the branch ${op.branches.join(', ')} would delete a branch another live session has checked out.`,
		peers.filter(
			(p) =>
				p.record.repo === repo &&
				p.record.branch !== undefined &&
				op.branches.includes(p.record.branch),
		),
		now,
	);
};

/** Any clone of the remote: a force push rewrites the branch every clone pulls. */
const forcePushRule: Rule<'force-push'> = (op, placeOf, { peers, now }) => {
	if (op.dir === undefined) return ALLOW;
	const place = placeOf(op.dir);
	const branch = op.branch ?? place.branch;
	if (!branch) return ALLOW;
	return block(
		`force-pushing ${branch} would rewrite a branch another live session has checked out and is building on.`,
		peers.filter(
			(p) => p.record.branch === branch && sameRepository(place, p.record),
		),
		now,
	);
};

const deleteRule: Rule<'delete'> = (op, _placeOf, ctx) => {
	const { peers, now, settings, self } = ctx;
	const mine = [...worktreesOf(self, now, settings)];
	for (const path of op.paths) {
		const holding = peers.filter((p) => heldUnder(p.record, path, ctx));
		if (holding.length) {
			return block(
				`deleting or moving ${path} would remove something another live session works in, edited recently, or claims.`,
				holding,
				now,
			);
		}
		// A worktree nested in a peer's (`<repo>/.claude/worktrees/x`) is still
		// this session's own: the containment that counts is the innermost.
		if (mine.some((t) => isInside(path, t))) continue;
		const inside = peers.filter(
			(p) =>
				p.record.claims.some((c) => isInside(path, c.path)) ||
				(p.record.worktree !== undefined && isInside(path, p.record.worktree)),
		);
		if (inside.length) {
			return block(
				`${path} is inside a worktree or folder that belongs to another live session, and this session does not work there.`,
				inside,
				now,
			);
		}
	}
	for (const pattern of op.patterns) {
		const glob = new Bun.Glob(pattern);
		const matching = peers.filter(
			(p) =>
				recentEdits(p.record, now, settings).some((e) => glob.match(e.path)) ||
				p.record.claims.some((c) => glob.match(c.path)),
		);
		if (matching.length) {
			return block(
				`${pattern} matches a file another live session edited recently, or a folder it claims.`,
				matching,
				now,
			);
		}
	}
	return ALLOW;
};

const RULES: { readonly [K in Op['kind']]: Rule<K> } = {
	tree: treeRule,
	'worktree-remove': worktreeRemoveRule,
	'branch-delete': branchDeleteRule,
	'force-push': forcePushRule,
	delete: deleteRule,
	publish: () => ALLOW,
};

function judge(op: Op, placeOf: PlaceOf, ctx: Context): Verdict {
	return (RULES[op.kind] as Rule<Op['kind']>)(op, placeOf, ctx);
}

export function evaluateBash(
	ops: readonly Op[],
	placeOf: PlaceOf,
	ctx: Context,
): Verdict {
	const notes: string[] = [];
	for (const op of ops) {
		const verdict = judge(op, placeOf, ctx);
		if (verdict.decision === 'deny') return verdict;
		if (verdict.context) notes.push(verdict.context);
	}
	const publish = ops.find((op) => op.kind === 'publish');
	if (publish?.kind !== 'publish') {
		return notes.length
			? { decision: 'allow', context: notes.join('\n\n'), warned: [] }
			: ALLOW;
	}
	const text =
		publish.text.length > 160 ? `${publish.text.slice(0, 159)}…` : publish.text;
	const who = ctx.peers.length
		? ctx.peers.map((p) => `- ${describe(p, ctx.now)}`).join('\n')
		: '- none';
	notes.push(
		`nxgt-crew: this command publishes. It is recorded as a release announcement in the crew registry. Live sessions that may build against the published version:\n${who}\nA session that depends on it learns of it at its next prompt; SendMessage reaches it sooner.`,
	);
	return {
		decision: 'allow',
		context: notes.join('\n\n'),
		warned: [],
		publish: `publishing: ${text}`,
	};
}
