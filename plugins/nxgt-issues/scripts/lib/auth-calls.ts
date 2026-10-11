/**
 * Literal secrets handed to an authentication or crypto call, wherever the
 * call sits (an assignment, an `expect`, a bare statement): the quoted
 * arguments of `hash`, `hashSync`, `compare`, `compareSync`, `sign`, `verify`,
 * `encrypt`, `decrypt`, `createHmac`, `login`, `signIn` and `authenticate`
 * are values in their own right. Each refuses unless `isPlaceholder` accepts
 * it (`'<secret>'`, `'****'`) or it is an algorithm or encoding name
 * (`'sha256'`); the first argument of `login`, `signIn` and `authenticate` is
 * the user name and stays allowed. Letters only is no excuse: `'mysecret'` is
 * a secret.
 */

import { isPlaceholder, KNOWN_LITERALS } from './code-values';

const AUTH_CALL =
	/(?<![\w$])(hash|hashSync|compare|compareSync|sign|verify|encrypt|decrypt|createHmac|login|signIn|authenticate)\s*\(/g;
const USER_FIRST = new Set(['login', 'signIn', 'authenticate']);
const OPEN = '([{';
const CLOSE = ')]}';
const MAX_SCAN = 1000;

/** The top-level arguments of a call whose `(` ends just before `start`. */
export function callArguments(text: string, start: number): string[] {
	const args: string[] = [];
	let depth = 0;
	let quote = '';
	let current = '';
	for (let i = start; i < Math.min(text.length, start + MAX_SCAN); i++) {
		const char = text[i] ?? '';
		if (quote) {
			if (char === '\\') {
				current += char + (text[++i] ?? '');
				continue;
			}
			if (char === quote) quote = '';
		} else if (char === "'" || char === '"' || char === '`') {
			quote = char;
		} else if (OPEN.includes(char)) {
			depth++;
		} else if (CLOSE.includes(char)) {
			if (depth === 0) break;
			depth--;
		} else if (char === ',' && depth === 0) {
			args.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim()) args.push(current.trim());
	return args;
}

const literalOf = (arg: string): string | undefined =>
	/^(["'`])((?:\\.|(?!\1).)*)\1$/s.exec(arg)?.[2];

/** True when a call in `text` is handed a literal secret. */
export function hasSecretArgument(text: string): boolean {
	for (const match of text.matchAll(AUTH_CALL)) {
		const name = match[1] ?? '';
		const args = callArguments(text, match.index + match[0].length);
		for (const [index, arg] of args.entries()) {
			if (index === 0 && USER_FIRST.has(name)) continue;
			const literal = literalOf(arg);
			if (literal === undefined) continue;
			if (KNOWN_LITERALS.has(literal.toLowerCase())) continue;
			if (!isPlaceholder(arg)) return true;
		}
	}
	return false;
}
