/**
 * Reads a Bash command's text for the operations another session could be hurt
 * by: moving a worktree's HEAD or files, removing a worktree, deleting or
 * force-pushing a branch, deleting paths, and publishing.
 *
 * It is a reader of text, not a shell. It follows `cd` and `git -C` to know
 * where an operation lands, and gives up — returning no directory or no path —
 * on anything it cannot know without running the shell: a `$variable`, a
 * backtick, a `cd -`. Giving up means the guard does not check that operation;
 * it never means it blocks it.
 */

import { isAbsolute, join, resolve } from 'node:path';

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
			readonly paths: readonly string[];
	  }
	| { readonly kind: 'publish'; readonly dir?: string; readonly text: string };

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

const SEPARATORS = new Set(['&&', '||', ';', '|', '&', '\n', '(', ')', '|&']);

/**
 * Splits a command line into words and separators. Quotes group, a backslash
 * escapes, and `$(`/backtick open a nested command whose words are read like
 * any other segment. A word that still needs the shell to mean something
 * carries a `$` or a backtick and is treated as unknown downstream.
 */
export function tokenize(command: string): string[] {
	const tokens: string[] = [];
	let word = '';
	let quoted = false;
	const push = () => {
		if (word !== '' || quoted) tokens.push(word);
		word = '';
		quoted = false;
	};
	let i = 0;
	while (i < command.length) {
		const c = command[i] as string;
		const two = command.slice(i, i + 2);
		if (c === "'") {
			const end = command.indexOf("'", i + 1);
			const stop = end === -1 ? command.length : end;
			word += command.slice(i + 1, stop);
			quoted = true;
			i = stop + 1;
			continue;
		}
		if (c === '"') {
			i++;
			while (i < command.length && command[i] !== '"') {
				if (command[i] === '\\' && i + 1 < command.length) {
					word += command[i + 1];
					i += 2;
					continue;
				}
				word += command[i];
				i++;
			}
			quoted = true;
			i++;
			continue;
		}
		if (c === '\\' && i + 1 < command.length) {
			if (command[i + 1] !== '\n') word += command[i + 1];
			i += 2;
			continue;
		}
		if (two === '$(') {
			push();
			tokens.push('(');
			i += 2;
			continue;
		}
		if (c === '`') {
			push();
			tokens.push('(');
			i++;
			continue;
		}
		if (two === '&&' || two === '||' || two === '|&') {
			push();
			tokens.push(two);
			i += 2;
			continue;
		}
		if (SEPARATORS.has(c)) {
			push();
			tokens.push(c);
			i++;
			continue;
		}
		if (c === '#' && word === '' && !quoted) {
			while (i < command.length && command[i] !== '\n') i++;
			continue;
		}
		if (c === ' ' || c === '\t' || c === '\r') {
			push();
			i++;
			continue;
		}
		word += c;
		i++;
	}
	push();
	return tokens;
}

/** The words of each simple command, in order. */
export function segments(command: string): string[][] {
	const out: string[][] = [];
	let current: string[] = [];
	for (const token of tokenize(command)) {
		if (SEPARATORS.has(token)) {
			if (current.length) out.push(current);
			current = [];
		} else {
			current.push(token);
		}
	}
	if (current.length) out.push(current);
	return out;
}

const WRAPPERS = new Set([
	'sudo',
	'command',
	'exec',
	'time',
	'nohup',
	'env',
	'nice',
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Drops leading `VAR=value` assignments and wrappers such as `sudo` or `env`. */
export function stripPrefix(words: readonly string[]): string[] {
	let i = 0;
	while (i < words.length) {
		const w = words[i] as string;
		if (ASSIGNMENT.test(w) || WRAPPERS.has(w)) {
			i++;
			continue;
		}
		if (w.startsWith('-') && i > 0 && WRAPPERS.has(words[i - 1] as string)) {
			i++;
			continue;
		}
		break;
	}
	return words.slice(i);
}

/** Whether the shell would have to expand the word before it means anything. */
export function needsShell(word: string): boolean {
	return word.includes('$') || word.includes('`');
}

export interface Where {
	readonly cwd: string;
	readonly home: string;
}

/** An absolute path for `word` from `dir`, or `undefined` when only the shell would know. */
export function resolvePath(
	word: string,
	dir: string | undefined,
	home: string,
): string | undefined {
	if (needsShell(word) || word === '' || word === '-') return undefined;
	if (word === '~') return home;
	if (word.startsWith('~/')) return join(home, word.slice(2));
	if (word.startsWith('~')) return undefined;
	if (isAbsolute(word)) return resolve(word);
	return dir === undefined ? undefined : resolve(dir, word);
}

/**
 * A glob deletes what is under its first static directory, so the path checked
 * is that directory: `rm -rf /tmp/a/*` is checked as `/tmp/a`.
 */
export function staticBase(path: string): string {
	const parts = path.split('/');
	const firstGlob = parts.findIndex((p) => /[*?[]/.test(p));
	if (firstGlob === -1) return path;
	return parts.slice(0, firstGlob).join('/') || '/';
}

const positional = (args: readonly string[]) => {
	const out: string[] = [];
	let flagsDone = false;
	for (const a of args) {
		if (!flagsDone && a === '--') {
			flagsDone = true;
			continue;
		}
		if (!flagsDone && a.startsWith('-') && a !== '-') continue;
		out.push(a);
	}
	return out;
};

/** Global `git` options that take a value as the next word. */
const GIT_VALUE_OPTIONS = new Set([
	'-c',
	'--exec-path',
	'--namespace',
	'--config-env',
]);

function gitOps(
	args: readonly string[],
	dirIn: string | undefined,
	home: string,
	text: string,
): Op[] {
	let dir = dirIn;
	let i = 0;
	while (i < args.length) {
		const a = args[i] as string;
		if (a === '-C') {
			const target = args[i + 1];
			dir = target === undefined ? undefined : resolvePath(target, dir, home);
			i += 2;
			continue;
		}
		if (a.startsWith('--work-tree=')) {
			dir = resolvePath(a.slice('--work-tree='.length), dir, home);
			i++;
			continue;
		}
		if (GIT_VALUE_OPTIONS.has(a)) {
			i += 2;
			continue;
		}
		if (a.startsWith('-')) {
			i++;
			continue;
		}
		break;
	}
	const verb = args[i];
	const rest = args.slice(i + 1);
	if (verb === undefined) return [];

	if (TREE_VERBS.has(verb)) {
		if (verb === 'stash' && rest[0] && STASH_READS.has(rest[0])) return [];
		return [{ kind: 'tree', verb, dir }];
	}
	if (verb === 'worktree') {
		const sub = rest[0];
		if (sub === 'remove' || sub === 'move') {
			const target = positional(rest.slice(1))[0];
			return [
				{
					kind: 'worktree-remove',
					dir,
					target:
						target === undefined ? undefined : resolvePath(target, dir, home),
				},
			];
		}
		return [];
	}
	if (verb === 'branch') {
		const deleting = rest.some(
			(a) =>
				a === '-d' ||
				a === '-D' ||
				a === '--delete' ||
				/^-[a-zA-Z]*[dD][a-zA-Z]*$/.test(a),
		);
		if (!deleting) return [];
		const branches = positional(rest).filter((b) => !needsShell(b));
		return branches.length ? [{ kind: 'branch-delete', dir, branches }] : [];
	}
	if (verb === 'push') {
		const ops: Op[] = [];
		if (rest.includes('--tags') || rest.includes('--follow-tags')) {
			ops.push({ kind: 'publish', dir, text });
		}
		const forced = rest.some(
			(a) =>
				a === '-f' ||
				a === '--force' ||
				a.startsWith('--force-with-lease') ||
				a === '--force-if-includes' ||
				/^-[a-zA-Z]*f[a-zA-Z]*$/.test(a),
		);
		const refspecs = positional(rest).slice(1);
		const plusRefs = refspecs.filter((r) => r.startsWith('+'));
		if (!forced && plusRefs.length === 0) return ops;
		const targets = forced ? refspecs : plusRefs;
		if (targets.length === 0) {
			ops.push({ kind: 'force-push', dir });
			return ops;
		}
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
	}
	if (verb === 'rm') {
		const paths = resolvedPaths(positional(rest), dir, home);
		return paths.length ? [{ kind: 'delete', dir, paths }] : [];
	}
	return [];
}

function resolvedPaths(
	words: readonly string[],
	dir: string | undefined,
	home: string,
): string[] {
	const out: string[] = [];
	for (const w of words) {
		const p = resolvePath(w, dir, home);
		if (p !== undefined) out.push(staticBase(p));
	}
	return out;
}

const PACKAGE_MANAGERS = new Set(['npm', 'bun', 'pnpm', 'yarn']);
const RUNNERS = new Set(['bunx', 'npx', 'pnpx']);

function isPublish(words: readonly string[]): boolean {
	const [head, ...rest] = words;
	if (head === undefined) return false;
	if (PACKAGE_MANAGERS.has(head)) {
		if (rest[0] === 'publish') return true;
		if (head === 'yarn' && rest[0] === 'npm' && rest[1] === 'publish') {
			return true;
		}
		if (rest[0] === 'run' && rest[1] && /publish|release/.test(rest[1])) {
			return true;
		}
		if (
			head !== 'npm' &&
			rest[0] &&
			/^[\w:-]*(publish|release)[\w:-]*$/.test(rest[0])
		) {
			// `bun changeset:publish`, `pnpm release`: a script run without `run`.
			return true;
		}
		if (rest[0] === 'x' || rest[0] === 'exec' || rest[0] === 'dlx') {
			return isPublish(rest.slice(1));
		}
		return false;
	}
	if (RUNNERS.has(head)) return isPublish(rest);
	if (head === 'changeset' && rest[0] === 'publish') return true;
	if (head === 'gh' && rest[0] === 'release' && rest[1] === 'create') {
		return true;
	}
	return false;
}

/** Every operation in `command` that the guard checks, with where it lands. */
export function parseCommand(command: string, where: Where): Op[] {
	const ops: Op[] = [];
	let dir: string | undefined = where.cwd;
	for (const raw of segments(command)) {
		const words = stripPrefix(raw);
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
		if (head === 'git') {
			ops.push(...gitOps(args, dir, where.home, command.trim()));
			continue;
		}
		if (head === 'rm' || head === 'rmdir' || head === 'unlink') {
			const paths = resolvedPaths(positional(args), dir, where.home);
			if (paths.length) ops.push({ kind: 'delete', dir, paths });
			continue;
		}
		if (head === 'mv') {
			const sources = positional(args).slice(0, -1);
			const paths = resolvedPaths(sources, dir, where.home);
			if (paths.length) ops.push({ kind: 'delete', dir, paths });
			continue;
		}
		if (isPublish(words)) {
			ops.push({ kind: 'publish', dir, text: command.trim() });
		}
	}
	return ops;
}

/** The directories whose git place the guard must read before it can judge `ops`. */
export function directoriesToResolve(ops: readonly Op[]): string[] {
	const dirs = new Set<string>();
	for (const op of ops) {
		if (op.kind === 'delete' || op.kind === 'publish') continue;
		if (op.dir !== undefined) dirs.add(op.dir);
	}
	return [...dirs];
}
