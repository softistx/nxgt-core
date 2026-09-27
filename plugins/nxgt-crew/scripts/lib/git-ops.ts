/**
 * The `git` half of `command.ts`: which git invocations move a worktree, remove
 * one, delete or force-push a branch, delete paths or publish tags — and where
 * they land, following `-C` and `--work-tree=`.
 */

import type { Op } from './command';
import {
	deletionTarget,
	needsShell,
	positional,
	redact,
	resolvePath,
} from './shell';

/** Git verbs that move HEAD or rewrite the working tree of the worktree they run in. */
const TREE_VERBS = new Set([
	'checkout',
	'switch',
	'reset',
	'stash',
	'clean',
	'rebase',
	'merge',
	'pull',
	'restore',
	'cherry-pick',
	'revert',
	'am',
]);

/** `git stash` subcommands that only read. */
const STASH_READS = new Set(['list', 'show']);

/** Global `git` options that take a value as the next word. */
const GIT_VALUE_OPTIONS = new Set([
	'-c',
	'--exec-path',
	'--namespace',
	'--config-env',
]);

/** A delete op for the paths `words` name, or none when none can be read. */
export function deletion(
	words: readonly string[],
	dir: string | undefined,
	home: string,
): Op[] {
	const paths: string[] = [];
	const patterns: string[] = [];
	for (const w of words) {
		const abs = resolvePath(w, dir, home);
		if (abs === undefined) continue;
		const target = deletionTarget(abs);
		if ('pattern' in target) patterns.push(target.pattern);
		else paths.push(target.path);
	}
	return paths.length || patterns.length
		? [{ kind: 'delete', dir, paths, patterns }]
		: [];
}

type GitReader = (
	rest: readonly string[],
	dir: string | undefined,
	home: string,
) => Op[];

const worktreeOps: GitReader = (rest, dir, home) => {
	const sub = rest[0];
	if (sub !== 'remove' && sub !== 'move') return [];
	const target = positional(rest.slice(1))[0];
	return [
		{
			kind: 'worktree-remove',
			dir,
			target: target === undefined ? undefined : resolvePath(target, dir, home),
		},
	];
};

const branchOps: GitReader = (rest, dir) => {
	const deleting = rest.some(
		(a) => a === '--delete' || /^-[a-zA-Z]*[dD][a-zA-Z]*$/.test(a),
	);
	if (!deleting) return [];
	const branches = positional(rest).filter((b) => !needsShell(b));
	return branches.length ? [{ kind: 'branch-delete', dir, branches }] : [];
};

const pushOps: GitReader = (rest, dir) => {
	const ops: Op[] = [];
	if (rest.includes('--tags') || rest.includes('--follow-tags')) {
		ops.push({ kind: 'publish', dir, text: redact(['git', 'push', ...rest]) });
	}
	const forced = rest.some(
		(a) =>
			a === '--force' ||
			a.startsWith('--force-with-lease') ||
			a === '--force-if-includes' ||
			/^-[a-zA-Z]*f[a-zA-Z]*$/.test(a),
	);
	const refspecs = positional(rest).slice(1);
	const targets = forced ? refspecs : refspecs.filter((r) => r.startsWith('+'));
	if (!forced && targets.length === 0) return ops;
	if (targets.length === 0) return [...ops, { kind: 'force-push', dir }];
	for (const ref of targets) {
		const bare = ref.replace(/^\+/, '');
		const dst = bare.includes(':') ? bare.split(':').pop() : bare;
		const branch = dst?.replace(/^refs\/heads\//, '');
		if (!branch || needsShell(branch)) continue;
		ops.push(
			branch === 'HEAD'
				? { kind: 'force-push', dir }
				: { kind: 'force-push', dir, branch },
		);
	}
	return ops;
};

const GIT_READERS: Readonly<Record<string, GitReader>> = {
	worktree: worktreeOps,
	branch: branchOps,
	push: pushOps,
	rm: (rest, dir, home) => deletion(positional(rest), dir, home),
};

export function gitOps(
	args: readonly string[],
	dirIn: string | undefined,
	home: string,
): Op[] {
	let dir = dirIn;
	let i = 0;
	while (i < args.length) {
		const a = args[i] as string;
		if (a === '-C') {
			const target = args[i + 1];
			dir = target === undefined ? undefined : resolvePath(target, dir, home);
			i += 2;
		} else if (a.startsWith('--work-tree=')) {
			dir = resolvePath(a.slice('--work-tree='.length), dir, home);
			i++;
		} else if (GIT_VALUE_OPTIONS.has(a)) {
			i += 2;
		} else if (a.startsWith('-')) {
			i++;
		} else {
			break;
		}
	}
	const verb = args[i];
	const rest = args.slice(i + 1);
	if (verb === undefined) return [];
	if (TREE_VERBS.has(verb)) {
		if (verb === 'stash' && rest[0] && STASH_READS.has(rest[0])) return [];
		return [{ kind: 'tree', verb, dir }];
	}
	return GIT_READERS[verb]?.(rest, dir, home) ?? [];
}
