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
 * unsafe one keeps its text. With `opaque`, the whitespace of its whole body
 * (up to the matching `)`) is made opaque, so a rule that reads a value up to
 * the next space reads the whole substitution; without it, the rules that need
 * real spaces (`curl -u`, `mysql -p`, `--password x`) see the command as typed.
 * `findSecrets` runs its rules on both texts.
 */

import { isSecretCommand } from './positional-secrets';

const MAX_BODY = 400;
const OPAQUE = '\u0001';
const PLACEHOLDER = '$COMMAND_SUBSTITUTION';
const SEGMENT = /\|\||&&|[|;&]/;
const COMMAND = /^[a-z][a-z0-9._/-]*$/;
const FLAG = /^--?[A-Za-z][\w-]*$/;
const ATTACHED_P = /^-p[A-Za-z\d]{2,}/;
const NAME_VALUE = /^(--?[A-Za-z][\w-]*)=(.*)$/;
const SECRET_FLAG =
	/^--?(?:password|passwd|pwd|plaintext|token|secret|api-?key|pass)$/;
const PATH = /^[\w.~/<>…-]*[/~][\w.~/<>…-]*$/;
const FILENAME = /^(?:\.[\w-]+|[\w-]+(?:\.[\w-]+)+)$/;
const PLACEHOLDER_WORD = /^<[\w-]+>$/;
const REFERENCE = /^op:\/\/[\w./-]+$/;
/** A jq or jsonpath accessor: `.access_token`, `jsonpath='{.data.secret}'`. */
const ACCESSOR = /^(?:[A-Za-z-]+=)?["']?\{?\.[\w.[\]*-]*\}?["']?$/;
/** A quoted format or separator with no letter or digit: `'%{http_code}'`, `"\n"`. */
const FORMAT = /^(["'])(?:%\{\w+\}|(?:\\[nrt]|[^A-Za-z\d\\])*)\1$/;
const WORD = /^[A-Za-z][A-Za-z_-]*$/;
const VARIABLE_PARTS = /["']?(?:\$\{\w+\}|\$\w+)["']?/g;
const PRINTERS = new Set(['echo', 'printf', 'expr', 'basename', 'yes']);
/** Commands that run the command that follows them. */
const WRAPPERS = new Set(
	'env command xargs busybox sudo exec time nice nohup'.split(' '),
);

/** An argument made only of `$VARIABLES` and separators: `"$U:$P"`. */
const isVariables = (arg: string): boolean =>
	arg.includes('$') && /^[\s:@/.,_-]*$/.test(arg.replace(VARIABLE_PARTS, ''));

/** A value that only refers to a secret: a variable, a path, `<x>`. */
const isReference = (arg: string): boolean =>
	isVariables(arg) || PATH.test(arg) || PLACEHOLDER_WORD.test(arg);

/** An argument that names, reads or measures something: it carries no secret value. */
function isSafeArgument(arg: string, command: string): boolean {
	if (isVariables(arg)) return true;
	if (PRINTERS.has(command)) return FLAG.test(arg);
	if (ATTACHED_P.test(arg)) return false;
	const named = NAME_VALUE.exec(arg);
	if (named) {
		const value = named[2] ?? '';
		if (SECRET_FLAG.test(named[1] ?? '')) return isReference(value);
		return value === '' || isSafeArgument(value, command);
	}
	return (
		FLAG.test(arg) ||
		/^\d+$/.test(arg) ||
		PATH.test(arg) ||
		FILENAME.test(arg) ||
		PLACEHOLDER_WORD.test(arg) ||
		REFERENCE.test(arg) ||
		ACCESSOR.test(arg) ||
		FORMAT.test(arg) ||
		WORD.test(arg)
	);
}

/** One pipeline segment: a lower-case command and arguments that carry no value. */
function isReadOnlySegment(segment: string): boolean {
	const words = segment.trim().split(/\s+/);
	while (WRAPPERS.has(words[0] ?? '')) {
		words.shift();
		while (words[0]?.startsWith('-')) words.shift();
	}
	if (isSecretCommand(words.join(' '))) return false;
	const [command = '', ...args] = words;
	if (!COMMAND.test(command)) return false;
	let secretNext = false;
	for (const arg of args) {
		const ok = secretNext ? isReference(arg) : isSafeArgument(arg, command);
		if (!ok) return false;
		secretNext = SECRET_FLAG.test(arg);
	}
	return !secretNext;
}

/** Whether the body of a `$(…)` only reads: no literal value in it. */
export function isReadOnlyBody(body: string): boolean {
	if (/[`]|\$\(/.test(body)) return false;
	return body.split(SEGMENT).every(isReadOnlySegment);
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

/**
 * `text` with every command substitution made a placeholder; an unsafe one is
 * kept, with the whitespace of its body made opaque when `opaque` is set.
 */
export function neutralizeSubstitutions(text: string, opaque: boolean): string {
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
			: `$(${opaque ? body.replace(/\s/g, OPAQUE) : body})`;
		from = end + 1;
	}
	return out + text.slice(from);
}
