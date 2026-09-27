/**
 * Splits a Bash command line into words and separators — the first pass of
 * `shell.ts`. Quotes group, a backslash escapes, `$(` and a backtick open a
 * nested command, `#` starts a comment, and a heredoc's body is skipped.
 */

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

/** A quoted run: the text it adds to the word, and the index after it. */
interface Quoted {
	readonly text: string;
	readonly next: number;
}

/** Reads a `'…'` run starting at `i`: nothing inside is special. */
function singleQuoted(command: string, i: number): Quoted {
	const end = command.indexOf("'", i + 1);
	const stop = end === -1 ? command.length : end;
	return { text: command.slice(i + 1, stop), next: stop + 1 };
}

/** Reads a `"…"` run starting at `i`: a backslash escapes the next character. */
function doubleQuoted(command: string, i: number): Quoted {
	let text = '';
	let j = i + 1;
	while (j < command.length && command[j] !== '"') {
		if (command[j] === '\\' && j + 1 < command.length) {
			text += command[j + 1];
			j += 2;
			continue;
		}
		text += command[j];
		j++;
	}
	return { text, next: j + 1 };
}

/** A heredoc opening `<<EOF`, `<<-'EOF'`… at `i`: its delimiter and length. */
function heredocAt(
	command: string,
	i: number,
): { readonly delimiter: string; readonly length: number } | undefined {
	if (command.slice(i, i + 2) !== '<<' || command[i + 2] === '<') return;
	const match = HEREDOC.exec(command.slice(i));
	if (!match) return;
	return { delimiter: match[3] as string, length: match[0].length };
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

/**
 * Splits a command line into words and separators. A heredoc's body is
 * skipped — it is data for the command, not commands.
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
		const heredoc = heredocAt(command, i);
		if (c === '\n' && heredocs.length) {
			push();
			tokens.push('\n');
			i = skipHeredocBodies(command, i + 1, heredocs.splice(0));
		} else if (heredoc) {
			push();
			heredocs.push(heredoc.delimiter);
			i += heredoc.length;
		} else if (c === "'" || c === '"') {
			const run = (c === "'" ? singleQuoted : doubleQuoted)(command, i);
			word += run.text;
			quoted = true;
			i = run.next;
		} else if (c === '\\' && i + 1 < command.length) {
			if (command[i + 1] !== '\n') word += command[i + 1];
			i += 2;
		} else if (two === '$(' || c === '`') {
			push();
			tokens.push(c === '`' ? '`' : '(');
			i += c === '`' ? 1 : 2;
		} else if (two === '&&' || two === '||' || two === '|&') {
			push();
			tokens.push(two);
			i += 2;
		} else if (SEPARATORS.has(c)) {
			push();
			tokens.push(c);
			i++;
		} else if (c === '#' && word === '' && !quoted) {
			while (i < command.length && command[i] !== '\n') i++;
		} else if (c === ' ' || c === '\t' || c === '\r') {
			push();
			i++;
		} else {
			word += c;
			i++;
		}
	}
	push();
	return tokens;
}
