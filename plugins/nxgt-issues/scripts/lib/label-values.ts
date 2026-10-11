/**
 * Values after a credential label that are not secrets, and encoders that
 * hide one. An error class followed by a message (`JsonWebTokenError: invalid
 * signature`) and a validation or status message (`password: too short`,
 * `token: has expired`) pass; a passphrase does not (`password: open sesame`,
 * `password: must change me`). An encoder assigned to a credential name
 * (`const secret = new TextEncoder().encode('x')`) holds its literal to the
 * key-position rule.
 */

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
	/^(?:too short|too long|(?:is|was|are) (?:required|invalid|missing|expired|incorrect)|has expired|not found|must be set|must be at least \d+ characters|cannot be empty|does not match|an opaque string|it fails)[.!]?$/;
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
	if (!LOWER_PROSE.test(value)) return false;
	const opensWithStatus = STATUS_START.test(value) && !/\d/.test(value);
	return opensWithStatus || STATUS_PHRASE.test(value);
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
