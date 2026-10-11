/**
 * Credentials. `scrubTokens` replaces what is recognisably a token (known
 * prefixes, JWTs, long random-looking runs); `findSecrets` names the credential
 * assignments that make a filing refuse instead (`DB_PASS=x`, `"password":
 * "x"`, `Authorization: Bearer x`, a private key block). A refusal reports the
 * keyword, never the value.
 *
 * An assignment whose value is plainly not a secret is let through: a TS type
 * or a literal word (`password: string`), a reference to the environment
 * (`token: process.env.TOKEN`), a short run of English (`the secret: it fails`),
 * a placeholder (`<token>`, `<redacted>`) or a mask (`****`). Nothing else is.
 */

const TOKEN_PATTERNS: readonly RegExp[] = [
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	/\bnpm_[A-Za-z0-9]{20,}\b/g,
	/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
];

function entropy(text: string): number {
	const counts = new Map<string, number>();
	for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
	let bits = 0;
	for (const count of counts.values()) {
		const p = count / text.length;
		bits -= p * Math.log2(p);
	}
	return bits;
}

/** A 40-hex git SHA, alone between non-alphanumerics: useful upstream, not private. */
const GIT_SHA = /(?<![0-9A-Za-z])[0-9a-f]{40}(?![0-9A-Za-z])/g;

/**
 * A run over 32 characters that mixes letters and digits and looks random.
 * Full SHAs are taken out first; short SHAs (7 to 12 hex) never reach the
 * length threshold.
 */
export const looksLikeSecret = (run: string): boolean => {
	const rest = run.replace(GIT_SHA, '');
	return (
		rest.length > 32 &&
		/[A-Za-z]/.test(rest) &&
		/\d/.test(rest) &&
		entropy(rest) >= 3.5
	);
};

/** Known token shapes and nothing else (the entropy rule needs URL context). */
export function scrubKnownTokens(text: string, note: (kind: string) => void) {
	let out = text;
	for (const pattern of TOKEN_PATTERNS) {
		out = out.replace(pattern, () => {
			note('token');
			return '<token>';
		});
	}
	return out;
}

const WORDS = new Set(
	(
		'string number boolean bigint symbol object array function void never ' +
		'undefined null unknown any true false required optional missing invalid ' +
		'empty expired incorrect wrong none yes no ' +
		'it the a an this that is are was be not to of in on for and or if'
	).split(' '),
);

const KEYWORD_WORDS = new Set([
	'password',
	'passwd',
	'pwd',
	'pass',
	'secret',
	'token',
	'bearer',
	'credential',
	'credentials',
	'auth',
	'apikey',
	'privatekey',
]);

/** The canonical keyword a variable name carries, from its words. */
function keywordOf(name: string): string | undefined {
	const words = name
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	for (const [index, word] of words.entries()) {
		if (KEYWORD_WORDS.has(word)) return word === 'apikey' ? 'api-key' : word;
		const next = words[index + 1];
		if (word === 'api' && next === 'key') return 'api-key';
		if (word === 'private' && next === 'key') return 'private-key';
	}
	return undefined;
}

/** True when `value` cannot be a secret: a type, a word, an env reference, a mask. */
export function isPlaceholder(raw: string): boolean {
	const value = raw
		.replace(/(?:\[\])+(?=[;,)}\]"'`]*$)/, '')
		.replace(/^["'`]+|["'`;,)}\]]+$/g, '')
		.toLowerCase();
	return (
		value === '' ||
		WORDS.has(value) ||
		/^<[^<>]{0,40}>$/.test(value) ||
		/^[*•x]{3,}$|^\.{3}$|^…$/.test(value) ||
		/^(?:[\w$]+\.)*env\.[\w$]+$/.test(value)
	);
}

const ASSIGNMENT =
	/(?<![\w-])([\w-]+)\??["']?[ \t]*[:=](?![=>])[ \t]*(?=(\S+))/g;
const AUTHORIZATION =
	/\bAuthorization["']?[ \t]*[:=][ \t]*(?:Basic|Bearer|token)[ \t]+(\S+)/gi;
/** `Bearer` followed by a value that looks like a token, not by a word. */
const BEARER = /\bBearer[ \t]+([\w.~+/=-]{8,})/gi;
/** Words that follow `Bearer` or `token` in prose. */
const TOKEN_WORDS = /^(?:tokens?|auth|authentication|header)\W*$/i;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/**
 * The credential assignments in already-transformed text, each a reason to
 * refuse, as keywords: `password`, `api-key`, `bearer`, `authorization`...
 */
export function findSecrets(text: string): string[] {
	const found = new Set<string>();
	for (const match of text.matchAll(ASSIGNMENT)) {
		const keyword = keywordOf(match[1] ?? '');
		if (keyword && !isPlaceholder(match[2] ?? '')) found.add(keyword);
	}
	for (const match of text.matchAll(AUTHORIZATION)) {
		const value = match[1] ?? '';
		if (!isPlaceholder(value) && !TOKEN_WORDS.test(value)) {
			found.add('authorization');
		}
	}
	for (const match of text.matchAll(BEARER)) {
		const value = match[1] ?? '';
		if (/[\d._~+/=]/.test(value) && !isPlaceholder(value)) found.add('bearer');
	}
	if (PRIVATE_KEY_BLOCK.test(text)) found.add('private-key-block');
	return [...found];
}
