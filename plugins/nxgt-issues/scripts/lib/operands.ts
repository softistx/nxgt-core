/**
 * What a compared literal is compared to. `x === 'k3J9…'` is a secret when `x`
 * is a credential (`password`, `input.apiKey`, the password parameter of a
 * `verifyUser` callback) and an ordinary value when it is not (`method`,
 * `s.kind`). The role of the literal follows:
 *
 * - `strict`: a credential operand; the literal is checked like any value.
 * - `compare-scope`: a member named like a scope list (`claims.scope`,
 *   `user.roles`), where `read:users` is a permission, not `user:pass`.
 * - `compare-member`: a member that is not a credential (`s.kind`), where an
 *   enum value such as `refresh_token` is not a secret.
 * - `compare`: any other operand (a call, a bare identifier).
 */

import { wordsOf } from './code-values';
import { looksLikeCredential } from './literals';

export type Role = 'strict' | 'compare' | 'compare-member' | 'compare-scope';
export type Operand = string | undefined;

const PATH = '[A-Za-z_$][\\w$]*(?:\\??\\.[A-Za-z_$][\\w$]*)*';
const PATH_AT_END = new RegExp(`(${PATH})$`);
const PATH_AT_START = new RegExp(`^(${PATH})(?![\\w$]|\\s*\\()`);
const CREDENTIAL_WORDS = new Set(
	'password pass passwd pwd secret token key apikey'.split(' '),
);
const SCOPE_WORDS = new Set(
	'scope scopes permission permissions role roles'.split(' '),
);
const SECRET_WORD = /secret|passw|pwd|key|token/;
const SNAKE = /^[a-z]+(?:_[a-z]+)+$/;
const SCOPE = /^[a-z*_-]+(?::[a-z*_-]+)+$/;
const VERB_SCOPE =
	/^(?:read|write|admin|delete|create|update|manage|list|view|edit|get|put|post):[a-z*_-]+(?::[a-z*_-]+)*$/;

/** The identifier or member path that ends `text`, if any. */
export const pathAtEnd = (text: string): Operand =>
	PATH_AT_END.exec(text.trimEnd())?.[1];

/** The identifier or member path that starts `text` (not a call), if any. */
export const pathAtStart = (text: string): Operand =>
	PATH_AT_START.exec(text.trimStart())?.[1];

const lastName = (path: string): string => path.split(/\??\./).pop() ?? path;

function isCredential(path: string, params: ReadonlySet<string>): boolean {
	const name = lastName(path);
	return params.has(name) || wordsOf(name).some((w) => CREDENTIAL_WORDS.has(w));
}

/** The role of a compared literal, from what it is compared to. */
export function classify(
	operands: readonly Operand[],
	params: ReadonlySet<string>,
): Role {
	const paths = operands.filter((op): op is string => op !== undefined);
	if (paths.some((path) => isCredential(path, params))) return 'strict';
	const member = paths.find((path) => path.includes('.'));
	if (member === undefined) return 'compare';
	return wordsOf(lastName(member)).some((w) => SCOPE_WORDS.has(w))
		? 'compare-scope'
		: 'compare-member';
}

/**
 * Whether a compared literal looks like a credential: mixed letters and
 * digits, a credential word, `user:pass`. A lowercase snake_case enum value
 * (`refresh_token`) passes unless it holds a secret word and its operand is
 * not a plain member; a lowercase scope (`read:users`) passes by its verb or
 * against a scope-like member.
 */
export function comparesSecret(text: string, role: Role): boolean {
	if (!looksLikeCredential(text)) return false;
	if (SNAKE.test(text)) {
		return (
			SECRET_WORD.test(text) &&
			role !== 'compare-member' &&
			role !== 'compare-scope'
		);
	}
	if (VERB_SCOPE.test(text)) return false;
	return !(role === 'compare-scope' && SCOPE.test(text));
}

/** Whether a literal of this role may pass: compared, and not a credential. */
export const passesAsCompared = (role: Role, text: string): boolean =>
	role !== 'strict' && !comparesSecret(text, role);
