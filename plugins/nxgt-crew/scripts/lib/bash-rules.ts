/**
 * The rule table for Bash commands: one rule per operation `command.ts` reads,
 * each deciding from the peers in the way. Only an active peer denies; `block`
 * turns idle ones into a note. Pure — the git place of a directory is passed
 * in. The table itself is documented in `conflicts.ts`.
 */

import type { Op } from './command';
import {
	ALLOW,
	block,
	type Context,
	describe,
	type PlaceOf,
	type Verdict,
	worktreesOf,
} from './conflicts';
import { recentEdits } from './holds';
import { isInside } from './paths';
import type { SessionRecord } from './record';
import { sameRepository } from './scope';

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
