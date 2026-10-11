/**
 * Values after a credential label that are not secrets, and encoders that
 * hide one. An error class followed by a message (`JsonWebTokenError: invalid
 * signature`) and a validation or status message (`password: too short`,
 * `token: has expired`) pass; a passphrase does not (`password: open sesame`,
 * `password: must change me`). An encoder assigned to a credential name
 * (`const secret = new TextEncoder().encode('x')`) holds its literal to the
 * key-position rule.
 */

import { isPlaceholder, wordsOf } from './code-values';
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
	/^(?:too short|too long|(?:is|was|are) (?:required|invalid|missing|expired|incorrect)|has expired|not found|must be set|must be at least \d+ characters|must contain(?: [a-z\d-]+)+|cannot be empty|does not match|an opaque string|it fails|(?:is )?not (?:set|provided)|\(empty\)|undefined)(?:[.!]|\s*[,;]\s*[\w-]+\s*:.*|(?:\s+[a-z]+){1,6}[.!]?)?$/;
const LOWER_PROSE = /^[a-z\d]+(?:[ \t]+[a-z\d]+)+[.!]?$/;

/** True when the value after `name` and `operator` is a message, not a secret. */
export function isLabelMessage(
	name: string,
	operator: string,
	value: string,
): boolean {
	if (ERROR_CLASS.test(name) && !operator.includes('=')) {
		const message = value.replace(/[\s"'`}\]),;]+$/, ''); // closing JSON punctuation
		return ERROR_MESSAGE.test(message) && !isKeyMaterial(message);
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
	if (!/["'`]/.test(value)) return flowSequenceHoldsSecret(value);
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

/**
 * `passwords: [hunter2, swordfish]`: a YAML flow sequence of bare items. An
 * item passes when it reads as code (a member expression or call, a camelCase
 * name that is not key material) or as a harmless word (`admin`).
 */
function flowSequenceHoldsSecret(value: string): boolean {
	const body = value.slice(
		1,
		value.includes(']') ? value.indexOf(']') : undefined,
	);
	const context = {
		template: false,
		inHeader: false,
		message: false,
		keyPosition: false,
	};
	return body
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.some((item) => {
			if (/[.(]/.test(item) || isPlaceholder(item)) return false;
			if (/^[a-z]+(?:[A-Z][a-z\d]*)+$/.test(item) && !isKeyMaterial(item))
				return false;
			return !isHarmlessLiteral(item, context);
		});
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
