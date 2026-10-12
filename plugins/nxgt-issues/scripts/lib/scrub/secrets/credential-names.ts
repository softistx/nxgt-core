/**
 * Whether a name reads as a credential, by its last word only: `userPassword`,
 * `x-gateway-secret`, `DB_PASSWORD` are; `tokenType`, `passwordStrength`,
 * `JWT_SECRET_FILE` and `sortKey` are not. A `key` counts only after a
 * qualifier (`apiKey`, `signingKey`), as in key-names.ts.
 */

/** The last words that make a name a credential. */
const LAST_WORDS = new Set(
	'password pass passwd pwd secret token apikey authorization'.split(' '),
);
const KEY_QUALIFIERS = new Set(
	'api secret private signing access encryption hmac master'.split(' '),
);

/** The words of a name: split on separators and camelCase seams, lower-cased. */
export const wordsIn = (name: string): string[] =>
	name
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

export function namesCredential(name: string): boolean {
	const words = wordsIn(name);
	const last = words.at(-1) ?? '';
	if (last === 'key') return KEY_QUALIFIERS.has(words.at(-2) ?? '');
	return LAST_WORDS.has(last);
}

const PLAIN_IDENTIFIER = /^[A-Za-z_$][\w$.]*$/;
const CREDENTIAL_WORD =
	/secret|token|passw|api_?key|auth(?!or)|cookie|session/i;

/**
 * The other question, asked of a plain identifier that is assigned a literal
 * (`GATEWAY_SECRET_HEADER = "x"`, `authHeader`): does it hold a credential
 * word anywhere? `tokenType` does. `namesCredential` above is the strict one
 * for comparisons (`tokenType === "access"` compares a kind, not a secret), so
 * the two answer differently on purpose: neither refuses a superset of the
 * other, and merging them either way breaks a pinned over-refusal or lets a
 * credential-named assignment through.
 */
export const identifierHoldsCredentialWord = (identifier: string): boolean =>
	PLAIN_IDENTIFIER.test(identifier) && CREDENTIAL_WORD.test(identifier);
