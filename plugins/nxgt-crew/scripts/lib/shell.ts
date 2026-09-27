/**
 * Just enough of a shell reader to find the simple commands in a Bash command
 * line, and the paths they name. It is not a shell: anything that needs one —
 * a `$variable`, a backtick, `cd -` — comes back as unknown, and an unknown is
 * never checked by the guard.
 */

import { isAbsolute, join, resolve } from 'node:path';

/** Tokens that end a simple command. `(` and `)` also open and close a subshell. */
export const SEPARATORS = new Set([
	'&&',
	'||',
	';',
	'|',
	'&',
	'\n',
	'(',
	')',
	'|&',
]);

const HEREDOC = /^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/;

/**
 * Splits a command line into words and separators. Quotes group, a backslash
 * escapes, `$(` and a backtick open a nested command, `#` starts a comment,
 * and a heredoc's body is skipped — it is data for the command, not commands.
 */
export function tokenize(command: string): string[] {
	const tokens: string[] = [];
	const heredocs: string[] = [];
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
		if (c === '\n' && heredocs.length) {
			push();
			tokens.push('\n');
			i = skipHeredocBodies(command, i + 1, heredocs.splice(0));
			continue;
		}
		if (two === '<<' && command[i + 2] !== '<') {
			const match = HEREDOC.exec(command.slice(i));
			if (match) {
				push();
				heredocs.push(match[3] as string);
				i += match[0].length;
				continue;
			}
		}
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
		if (two === '$(' || c === '`') {
			push();
			tokens.push(c === '`' ? '`' : '(');
			i += c === '`' ? 1 : 2;
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

/** Skips each heredoc body in turn; returns the index after the last terminator line. */
function skipHeredocBodies(
	command: string,
	from: number,
	delimiters: readonly string[],
): number {
	let i = from;
	for (const delimiter of delimiters) {
		while (i < command.length) {
			const end = command.indexOf('\n', i);
			const line = command.slice(i, end === -1 ? command.length : end);
			i = end === -1 ? command.length : end + 1;
			if (line.trim() === delimiter) break;
		}
	}
	return i;
}

/** A simple command's words, or the opening or closing of a subshell. */
export type Item = { readonly words: string[] } | 'open' | 'close';

/**
 * The simple commands in order, with subshells marked so a `cd` inside one
 * can be undone when it closes. A backtick opens and closes by parity.
 */
export function items(command: string): Item[] {
	const out: Item[] = [];
	let words: string[] = [];
	let backticks = 0;
	const flush = () => {
		if (words.length) out.push({ words });
		words = [];
	};
	for (const token of tokenize(command)) {
		if (token === '`') {
			flush();
			out.push(backticks++ % 2 === 0 ? 'open' : 'close');
		} else if (token === '(') {
			flush();
			out.push('open');
		} else if (token === ')') {
			flush();
			out.push('close');
		} else if (SEPARATORS.has(token)) {
			flush();
		} else {
			words.push(token);
		}
	}
	flush();
	return out;
}

/** The words of each simple command, in order. */
export function segments(command: string): string[][] {
	return items(command).flatMap((i) =>
		typeof i === 'object' ? [i.words] : [],
	);
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

const GLOB = /[*?[]/;

/**
 * What a possibly globbed path deletes. A glob in the last component only,
 * other than a bare `*`, is a pattern: it removes matching entries, not the
 * folder. Anything else is checked at its first static directory —
 * `rm -rf /tmp/a/*` as `/tmp/a`.
 */
export function deletionTarget(
	path: string,
): { readonly path: string } | { readonly pattern: string } {
	const parts = path.split('/');
	const firstGlob = parts.findIndex((p) => GLOB.test(p));
	if (firstGlob === -1) return { path };
	const last = parts.length - 1;
	const name = parts[last] as string;
	if (firstGlob === last && name !== '*' && name !== '.*') {
		return { pattern: path };
	}
	return { path: parts.slice(0, firstGlob).join('/') || '/' };
}

/** The positional arguments: flags dropped, `--` honoured. */
export function positional(args: readonly string[]): string[] {
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
}

const SECRET_FLAG = /token|otp|auth|password|secret|key/i;

/**
 * The words of a command, safe to show another session: no leading
 * assignments, and the value of any flag that looks like a credential
 * replaced by `***`.
 */
export function redact(words: readonly string[]): string {
	const out: string[] = [];
	let hideNext = false;
	for (const w of stripPrefix(words)) {
		if (hideNext) {
			out.push('***');
			hideNext = false;
			continue;
		}
		const eq = w.indexOf('=');
		if (w.startsWith('-') && SECRET_FLAG.test(eq === -1 ? w : w.slice(0, eq))) {
			if (eq === -1) {
				out.push(w);
				hideNext = true;
			} else {
				out.push(`${w.slice(0, eq)}=***`);
			}
			continue;
		}
		out.push(w);
	}
	return out.join(' ');
}
