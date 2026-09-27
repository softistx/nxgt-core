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

import { deletion, gitOps } from './git-ops';
import { items, positional, redact, resolvePath, stripPrefix } from './shell';

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
