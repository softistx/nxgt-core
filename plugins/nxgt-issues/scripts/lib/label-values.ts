/**
 * Values after a credential label that are not secrets, and encoders that
 * hide one. An error class followed by a message (`JsonWebTokenError: invalid
 * signature`) and a validation or status message (`password: too short`,
 * `token: has expired`) pass; a passphrase does not (`password: open sesame`,
 * `password: must change me`). An encoder assigned to a credential name
 * (`const secret = new TextEncoder().encode('x')`) holds its literal to the
 * key-position rule.
 */

import { wordsOf } from './code-values';
import { isKeyMaterial } from './key-names';
import { isHarmlessLiteral } from './literals';

/** A PascalCase error class and a message of two or more words, not key material. */
const ERROR_CLASS = /^[A-Z][A-Za-z\d]*(?:Error|Exception)$/;
const ERROR_MESSAGE = /^[A-Za-z]+(?:[ \t]+[A-Za-z]+)+[.!]?$/;

/** Opens a status message: `invalid signature`, `required`. */
const STATUS_START =
	/^(?:too short|too long|required|invalid|missing|expired|not found|unauthorized|forbidden|incorrect|mismatch|malformed|cannot|failed|denied|rejected)\b/;
/** A whole status phrase: `is required`, `must be at least 8 characters`. */
const STATUS_PHRASE =
	/^(?:too short|too long|(?:is|was|are) (?:required|invalid|missing|expired|incorrect)|has expired|not found|must be set|must be at least \d+ characters|must contain(?: [a-z\d-]+)+|cannot be empty|does not match|an opaque string|it fails|(?:is )?not (?:set|provided)|\(empty\)|undefined)[.!]?$/;
const LOWER_PROSE = /^[a-z\d]+(?:[ \t]+[a-z\d]+)+[.!]?$/;

/** True when the value after `name` and `operator` is a message, not a secret. */
export function isLabelMessage(
	name: string,
	operator: string,
	value: string,
): boolean {
	if (ERROR_CLASS.test(name) && !operator.includes('=')) {
		return ERROR_MESSAGE.test(value) && !isKeyMaterial(value);
	}
	if (STATUS_PHRASE.test(value)) return true;
	return (
		LOWER_PROSE.test(value) && STATUS_START.test(value) && !/\d/.test(value)
	);
}

/** `secretName: 'GATEWAY_SECRET'`: a `*Name` key holding an environment variable name. */
export function isEnvNameValue(name: string, value: string): boolean {
	return (
		wordsOf(name).at(-1) === 'name' &&
		/^(["'`])[A-Z][A-Z\d]*(?:_[A-Z\d]+)+\1,?$/.test(value)
	);
}

const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;

/** `secret: ['s3cr3t']`: an array of string literals under a credential name. */
export function arrayHoldsSecret(value: string): boolean {
	if (!value.startsWith('[')) return false;
	for (const match of value.matchAll(QUOTED)) {
		const context = {
			template: match[1] === '`',
			inHeader: false,
			message: false,
			keyPosition: false,
		};
		if (!isHarmlessLiteral(match[2] ?? '', context)) return true;
	}
	return false;
}

/** A GraphQL type: `String`, `ID!`, `[String!]!`. */
const SDL_TYPE = /^\[?[A-Z]\w*!?\]?!?$/;
const SCALARS = new Set(
	(
		'String ID Int Float Boolean DateTime Date Time JSON JSONObject Email ' +
		'EmailAddress URL UUID ObjectID BigInt Upload Void'
	).split(' '),
);
/** What may follow a field's type: nothing, a directive, or the next field. */
const SDL_AFTER = /^(?:\s*$|\s*@|\s+\w+\s*[:(])/;
const SDL_BLOCK =
	/\b(?:type|input|interface)\s+[A-Z]\w*(?:\s+implements[^{}]*)?\s*$/;

/**
 * A GraphQL field type (`password: String!`): a known scalar anywhere, or any
 * type inside a `type`, `input` or `interface` block. `password: Hunter2!`
 * outside a block refuses.
 */
export function isGraphqlType(
	first: string,
	rest: string,
	before: string,
): boolean {
	if (!SDL_TYPE.test(first) || !SDL_AFTER.test(rest)) return false;
	if (SCALARS.has(first.replace(/[[\]!]/g, ''))) return true;
	const open = before.lastIndexOf('{');
	if (open < 0 || before.lastIndexOf('}') > open) return false;
	return SDL_BLOCK.test(before.slice(0, open));
}

const ENCODER =
	/(?:\bencode|\bBuffer\.from|\bbtoa)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/;
const KEY_LITERAL = { inHeader: false, message: false, keyPosition: true };

/** True when `value` hands an encoder a literal that is not plainly harmless. */
export function encodesSecret(value: string): boolean {
	const match = ENCODER.exec(value);
	if (!match) return false;
	const context = { ...KEY_LITERAL, template: match[1] === '`' };
	return !isHarmlessLiteral(match[2] ?? '', context);
}
