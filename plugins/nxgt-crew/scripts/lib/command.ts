/**
 * Reads a Bash command's text for the operations another session could be hurt
 * by: moving a worktree's HEAD or files, removing a worktree, deleting or
 * force-pushing a branch, deleting paths, and publishing.
 *
 * It follows `cd` (undone when a subshell closes) and `git -C` to know where an
 * operation lands, and gives up — no directory, no path — on anything only a
 * shell could know. Giving up means the guard does not check that operation;
 * it never means it blocks it.
 */

import {
	deletionTarget,
	items,
	needsShell,
	positional,
	redact,
	resolvePath,
	stripPrefix,
} from './shell';

export type Op =
	| { readonly kind: 'tree'; readonly verb: string; readonly dir?: string }
	| {
			readonly kind: 'worktree-remove';
			readonly dir?: string;
			readonly target?: string;
	  }
	| {
			readonly kind: 'branch-delete';
			readonly dir?: string;
			readonly branches: readonly string[];
	  }
	| {
			readonly kind: 'force-push';
			readonly dir?: string;
			/** Absent means the branch checked out in `dir`. */
			readonly branch?: string;
	  }
	| {
			readonly kind: 'delete';
			readonly dir?: string;
			/** Paths removed with everything under them. */
			readonly paths: readonly string[];
			/** Absolute globs in the last component (`/r/*.log`): only matching entries go. */
			readonly patterns: readonly string[];
	  }
	| {
			readonly kind: 'publish';
			readonly dir?: string;
			/** The publishing command, assignments dropped and credentials masked. */
			readonly text: string;
	  };

export interface Where {
	readonly cwd: string;
	readonly home: string;
}

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

function deletion(
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

function gitOps(
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

const PACKAGE_MANAGERS = new Set(['npm', 'bun', 'pnpm', 'yarn']);
const RUNNERS = new Set(['bunx', 'npx', 'pnpx']);
/** A script named `publish` or `release`, optionally namespaced: `changeset:publish`, `release:npm`. */
const PUBLISH_SCRIPT = /^(?:[\w-]+:)?(?:publish|release)(?::[\w-]+)?$/;

export function isPublish(words: readonly string[]): boolean {
	const [head, ...rest] = words;
	if (head === undefined) return false;
	if (PACKAGE_MANAGERS.has(head)) {
		const [first, second] = rest;
		if (first === 'publish') return true;
		if (head === 'yarn' && first === 'npm' && second === 'publish') return true;
		if (first === 'run' && second && PUBLISH_SCRIPT.test(second)) return true;
		// `bun changeset:publish`, `pnpm release`: a script run without `run`.
		if (head !== 'npm' && first && PUBLISH_SCRIPT.test(first)) return true;
		if (first === 'x' || first === 'exec' || first === 'dlx') {
			return isPublish(rest.slice(1));
		}
		return false;
	}
	if (RUNNERS.has(head)) return isPublish(rest);
	if (head === 'changeset' && rest[0] === 'publish') return true;
	return head === 'gh' && rest[0] === 'release' && rest[1] === 'create';
}

function segmentOps(
	words: readonly string[],
	dir: string | undefined,
	home: string,
): Op[] {
	const [head, ...args] = words;
	if (head === 'git') return gitOps(args, dir, home);
	if (head === 'rm' || head === 'rmdir' || head === 'unlink') {
		return deletion(positional(args), dir, home);
	}
	if (head === 'mv') return deletion(positional(args).slice(0, -1), dir, home);
	if (isPublish(words)) return [{ kind: 'publish', dir, text: redact(words) }];
	return [];
}

/** Every operation in `command` that the guard checks, with where it lands. */
export function parseCommand(command: string, where: Where): Op[] {
	const ops: Op[] = [];
	const stack: (string | undefined)[] = [];
	let dir: string | undefined = where.cwd;
	for (const item of items(command)) {
		if (item === 'open') {
			stack.push(dir);
			continue;
		}
		if (item === 'close') {
			if (stack.length) dir = stack.pop();
			continue;
		}
		const words = stripPrefix(item.words);
		const [head, ...args] = words;
		if (head === undefined) continue;
		if (head === 'cd' || head === 'pushd') {
			const target = args.find((a) => !a.startsWith('-') || a === '-');
			dir =
				target === undefined
					? where.home
					: resolvePath(target, dir, where.home);
			continue;
		}
		if (head === 'popd') {
			dir = undefined;
			continue;
		}
		ops.push(...segmentOps(words, dir, where.home));
	}
	return ops;
}

/** The directories whose git place the guard must read before it can judge `ops`. */
export function directoriesToResolve(ops: readonly Op[]): string[] {
	const dirs = new Set<string>();
	for (const op of ops) {
		if (op.kind === 'publish' || op.kind === 'delete') continue;
		if (op.dir === undefined) continue;
		dirs.add(op.dir);
	}
	return [...dirs];
}
