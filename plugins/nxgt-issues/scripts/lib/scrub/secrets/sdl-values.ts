/**
 * GraphQL SDL field types, which are code and not secrets (`password:
 * String!`): a known scalar anywhere, or a type inside a `type`, `input` or
 * `interface` block unless its name looks like a value (digits mixed into
 * letters, an all-capitals word over 3 characters, key material).
 */

import { isKeyMaterial } from './key-names';

/** A GraphQL type: `String`, `ID!`, `[String!]!`. */
const SDL_TYPE = /^\[?[A-Z]\w*!?\]?!?$/;
const SCALARS = new Set(
	(
		'String ID Int Float Boolean DateTime Date Time JSON JSONObject Email ' +
		'EmailAddress URL UUID ObjectID BigInt Upload Void'
	).split(' '),
);
/** A type name that is more likely a value: `K3J9xQ2m`, `ABCDEFGH`. */
const looksLikeValue = (name: string): boolean =>
	/[A-Za-z]\d|\d[A-Za-z]/.test(name) ||
	(/^[A-Z_]+$/.test(name) && name.length > 3) ||
	isKeyMaterial(name);

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
	if (looksLikeValue(first.replace(/[[\]!]/g, ''))) return false;
	const open = before.lastIndexOf('{');
	if (open < 0 || before.lastIndexOf('}') > open) return false;
	return SDL_BLOCK.test(before.slice(0, open));
}
