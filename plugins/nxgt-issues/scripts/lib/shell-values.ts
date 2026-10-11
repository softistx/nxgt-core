/**
 * Shell command substitutions, `$(…)`, in a filing. One that only reads a
 * secret from somewhere is a placeholder (`$(cat /run/secrets/db_password)`,
 * `$(gh auth token)`, `$(echo -n "$U:$P" | base64)`): every command word is
 * lower case, every argument is a flag, a `$VARIABLE` (alone or glued with
 * separators), a path, or, for a command other than `echo` and `printf`, a
 * plain word. One that holds a literal value is not: `$(echo admin:hunter2)`,
 * `$(printf 'x')`, `$(echo k3J9…)`, a quoted or digit-bearing argument, a
 * nested substitution.
 *
 * `neutralizeSubstitutions` rewrites the text before the credential rules run:
 * a safe substitution becomes `$COMMAND_SUBSTITUTION` (a placeholder), an
 * unsafe one keeps its text with the whitespace of its whole body (up to the
 * matching `)`) made opaque, so every rule that reads a value up to the next
 * space reads the whole substitution and finds the literal in it.
 */

const MAX_BODY = 400;
const OPAQUE = '\u0001';
const PLACEHOLDER = '$COMMAND_SUBSTITUTION';
const SEGMENT = /\|\||&&|[|;&]/;
const COMMAND = /^[a-z][a-z0-9._/-]*$/;
const FLAG = /^--?[A-Za-z][\w-]*$/;
const PATH = /^[\w.~/<>…-]*[/~][\w.~/<>…-]*$/;
const WORD = /^[A-Za-z][A-Za-z_-]*$/;
const VARIABLE_PARTS = /["']?(?:\$\{\w+\}|\$\w+)["']?/g;
const PRINTERS = new Set(['echo', 'printf']);

/** An argument made only of `$VARIABLES` and separators: `"$U:$P"`. */
const isVariables = (arg: string): boolean =>
	arg.includes('$') && /^[\s:@/.,_-]*$/.test(arg.replace(VARIABLE_PARTS, ''));

function isSafeArgument(arg: string, command: string): boolean {
	if (FLAG.test(arg) || isVariables(arg) || PATH.test(arg)) return true;
	return !PRINTERS.has(command) && WORD.test(arg);
}

/** Whether the body of a `$(…)` only reads: no literal value in it. */
export function isReadOnlyBody(body: string): boolean {
	if (/[`]|\$\(/.test(body)) return false;
	return body.split(SEGMENT).every((segment) => {
		const [command = '', ...args] = segment.trim().split(/\s+/);
		if (!COMMAND.test(command)) return false;
		return args.every((arg) => isSafeArgument(arg, command));
	});
}

/** The index of the `)` that closes the `(` before `from`, or -1. */
function closing(text: string, from: number): number {
	let depth = 1;
	let quote = '';
	const limit = Math.min(text.length, from + MAX_BODY);
	for (let i = from; i < limit; i++) {
		const char = text[i];
		if (quote) {
			if (char === quote) quote = '';
		} else if (char === "'" || char === '"') quote = char;
		else if (char === '(') depth++;
		else if (char === ')' && --depth === 0) return i;
	}
	return -1;
}

/** `text` with every command substitution made a placeholder or opaque (see the header). */
export function neutralizeSubstitutions(text: string): string {
	if (!text.includes('$(')) return text;
	let out = '';
	let from = 0;
	for (let at = text.indexOf('$('); at !== -1; at = text.indexOf('$(', from)) {
		const end = closing(text, at + 2);
		if (end === -1) break;
		const body = text.slice(at + 2, end);
		out += text.slice(from, at);
		out += isReadOnlyBody(body)
			? PLACEHOLDER
			: `$(${body.replace(/\s/g, OPAQUE)})`;
		from = end + 1;
	}
	return out + text.slice(from);
}
