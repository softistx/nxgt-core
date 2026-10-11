/**
 * Credentials. `scrubTokens` replaces what is recognisably a token (known
 * prefixes, JWTs, long random-looking runs); `findSecrets` names the credential
 * assignments that make a filing refuse instead (`DB_PASS=x`, `"password":
 * "x"`, `Authorization: Bearer x`, a private key block). A refusal reports the
 * keyword, never the value.
 *
 * An assignment whose value is plainly not a secret is let through: a TS type
 * or a literal word (`password: string`), a reference to the environment
 * (`token: process.env.TOKEN`), an object or array opener, a placeholder
 * (`<token>`, `<redacted>`) or a mask (`****`); and a small number or duration
 * for a name that counts something (`tokenTtl: 3600`, `maxToken: 5`). Articles
 * and pronouns are not placeholders: `password: the hunter2` refuses. A value
 * may sit on the next line (JSON, YAML).
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
		'empty expired incorrect wrong none yes no'
	).split(' '),
);

/** Words that mark a name as a count, size or duration rather than a secret. */
const QUANTITY =
	/(?:max|min|ttl|length|size|count|limit|expir|timeout|interval|rounds|age|len|num|retries|attempts)|(?:tokens|sessions|secrets|passwords|cookies)$/i;
const SMALL_NUMBER = /^(?:\d{1,4}|\d+(?:ms|s|m|h|d))$/i;

/**
 * The canonical keyword a variable name carries, found as a substring of the
 * lower-cased name: `PGPASSWORD`, `dbpassword`, `client_secret`, `sessionId`.
 * `pass` and `sid` over-match as substrings (`bypass`, `compass`, `inside`), so
 * they count only as a whole word of the name (`DB_PASS`, `sid`) or, for
 * `pass`, as the end of an all-capitals name (`REDISPASS`); `auth` does not
 * count in `author` or `authority`.
 */
function keywordOf(name: string): string | undefined {
	const lower = name.toLowerCase();
	const found =
		/password|passwd|pwd|secret|token|cookie|session|auth(?!or)/.exec(lower);
	if (found) return found[0];
	if (/api[_-]?key/.test(lower)) return 'api-key';
	if (/private[_-]?key/.test(lower)) return 'private-key';
	if (/credential/.test(lower)) return 'credentials';
	if (lower.includes('bearer')) return 'bearer';
	const words = name
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
	if (words.includes('pass') || words.includes('sid')) {
		return words.includes('pass') ? 'pass' : 'sid';
	}
	if (name === name.toUpperCase() && /pass$/.test(lower)) return 'pass';
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
		/^[{[]/.test(value) ||
		/^<[^<>]{0,40}>$/.test(value) ||
		/^[*•x]{3,}$|^\.{3}$|^…$/.test(value) ||
		/^(?:[\w$]+\.)*env\.[\w$]+$/.test(value)
	);
}

const ASSIGNMENT =
	/(?<![\w-])([\w-]+)\??["']?[ \t]*[:=](?![=>])[ \t]*(?:\r?\n[ \t]*)?(?=(\S+))/g;
const AUTHORIZATION =
	/\bAuthorization["']?[ \t]*[:=][ \t]*(?:(?:Basic|Bearer|Digest|Negotiate|token)[ \t]+)?(\S+)/gi;
const COOKIE = /\b(?:Set-)?Cookie["']?[ \t]*:[ \t]*(\S+)/gi;
/** `--password x`, `--token=x`, `--api-key x`. */
const FLAG =
	/(?<![\w-])--(password|passwd|pwd|token|secret|api-?key|pass)(?:=|[ \t]+)(?!-)(\S+)/gi;
/** `mysql -u root -phunter2`: `-p` takes its value attached. */
const MYSQL_P =
	/\b(?:mysql|mysqldump|mysqladmin|mariadb)\b[^\n]*?[ \t]-p(\S+)/gi;
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
		const name = match[1] ?? '';
		const value = match[2] ?? '';
		const keyword = keywordOf(name);
		if (!keyword || isPlaceholder(value) || value.endsWith(':')) continue;
		if (QUANTITY.test(name) && SMALL_NUMBER.test(value)) continue;
		found.add(keyword);
	}
	for (const match of text.matchAll(AUTHORIZATION)) {
		const value = match[1] ?? '';
		if (!isPlaceholder(value) && !TOKEN_WORDS.test(value)) {
			found.add('authorization');
		}
	}
	for (const match of text.matchAll(COOKIE)) {
		if (!isPlaceholder(match[1] ?? '')) found.add('cookie');
	}
	for (const match of text.matchAll(FLAG)) {
		if (!isPlaceholder(match[2] ?? ''))
			found.add(keywordOf(match[1] ?? '') ?? 'password');
	}
	if (MYSQL_P.test(text)) found.add('password');
	for (const match of text.matchAll(BEARER)) {
		const value = match[1] ?? '';
		const tokenLike = /[\d._~+/=]/.test(value) || value.length >= 16;
		if (tokenLike && !isPlaceholder(value) && !TOKEN_WORDS.test(value)) {
			found.add('bearer');
		}
	}
	if (PRIVATE_KEY_BLOCK.test(text)) found.add('private-key-block');
	return [...found];
}
