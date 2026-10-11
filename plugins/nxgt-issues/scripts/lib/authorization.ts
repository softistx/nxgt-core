/**
 * The `Authorization` header in a filing. Unquoted, its value refuses unless
 * it is a placeholder or a prose word (`Authorization: Bearer <token>`,
 * `Authorization header`). Quoted or in a template, the header rule applies:
 * a template whose fixed text is only the scheme (`` `Bearer ${token}` ``), or
 * a scheme concatenated with code (`'Bearer ' + token`), passes; a literal
 * credential refuses (`'Basic YWRt…'`, `` `Bearer abc123…` ``), and so does a
 * literal glued to a scheme anywhere, by `+` or inside `${…}`
 * (`'Bearer ' + 'k3J9…'`, `` `Basic ${'YWRt…'}` ``).
 */

import { isPlaceholder } from './code-values';
import { isHarmlessLiteral } from './literals';

const HEAD = /\bAuthorization["']?[ \t]*[:=][ \t]*/gi;
const SCHEME = /^(?:Basic|Bearer|Digest|Negotiate|token)\b[ \t]*/i;
const TOKEN_WORDS = /^(?:tokens?|auth|authentication|header)\W*$/i;
const HEADER_VALUE = { inHeader: true, message: false, keyPosition: true };

/** The end of a template literal opened at `start`, `${…}` and nested templates skipped. */
function templateEnd(text: string, start: number): number {
	const stack = ['template'];
	for (let i = start + 1; i < text.length; i++) {
		const char = text[i];
		const top = stack.at(-1);
		if (top === 'template') {
			if (char === '\\') i++;
			else if (char === '`') stack.pop();
			else if (char === '$' && text[i + 1] === '{') {
				stack.push('code');
				i++;
			}
		} else if (char === '`') stack.push('template');
		else if (char === '{') stack.push('code');
		else if (char === '}') stack.pop();
		if (stack.length === 0) return i;
	}
	return -1;
}

/** The quoted value at the start of `rest` and what follows it, or undefined. */
function quoted(rest: string): { body: string; after: string } | undefined {
	const quote = rest[0];
	if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
	const end =
		quote === '`'
			? templateEnd(rest, 0)
			: rest.slice(1).search(new RegExp(`(?<!\\\\)${quote}`)) + 1;
	if (end <= 0) return undefined;
	return { body: rest.slice(1, end), after: rest.slice(end + 1) };
}

function refusesValue(rest: string): boolean {
	const literal = quoted(rest);
	if (!literal) {
		const value = rest.replace(SCHEME, '').split(/\s/)[0] ?? '';
		return value !== '' && !isPlaceholder(value) && !TOKEN_WORDS.test(value);
	}
	const template = rest[0] === '`';
	if (template && literal.body.includes('${')) {
		return !isHarmlessLiteral(literal.body, { ...HEADER_VALUE, template });
	}
	const credential = literal.body.replace(SCHEME, '');
	if (credential === '') return false; // `'Bearer ' + token`
	return !isHarmlessLiteral(credential, { ...HEADER_VALUE, template });
}

/** A scheme-only literal and the `+` chain after it: `'Bearer ' + token + 'x'`. */
const CONCAT =
	/(["'])(?:Basic|Bearer|Digest|Token)[ \t]+\1((?:[ \t]*\+[ \t]*(?:(["'])(?:\\.|(?!\3).)*\3|[\w$.]+(?:\([^)\n]*\))?))+)/gi;
/** A template that opens with a scheme and code: `` `Bearer ${…}` ``. */
const SCHEME_TEMPLATE = /`(?:Basic|Bearer|Digest|Token)[ \t]+\$\{/gi;
const STRING = /(["'])((?:\\.|(?!\1).)*)\1/g;
const INNER = {
	template: false,
	inHeader: false,
	message: false,
	keyPosition: false,
};

/** A string literal in `code` that is not plainly harmless. */
const holdsLiteral = (code: string): boolean =>
	[...code.matchAll(STRING)].some((m) => !isHarmlessLiteral(m[2] ?? '', INNER));

/** Literals glued to a scheme, by `+` or inside `${…}`, wherever they sit. */
function schemeHoldsLiteral(text: string): boolean {
	for (const match of text.matchAll(CONCAT)) {
		if (holdsLiteral(match[2] ?? '')) return true;
	}
	for (const match of text.matchAll(SCHEME_TEMPLATE)) {
		const end = templateEnd(text, match.index);
		const body = text.slice(match.index + 1, end < 0 ? undefined : end);
		if (holdsLiteral(body)) return true;
	}
	return false;
}

/** True when an `Authorization` header in `text` carries a literal credential. */
export function hasAuthorizationSecret(text: string): boolean {
	if (schemeHoldsLiteral(text)) return true;
	for (const match of text.matchAll(HEAD)) {
		const rest = text.slice(match.index + match[0].length).split('\n')[0] ?? '';
		if (refusesValue(rest)) return true;
	}
	return false;
}
