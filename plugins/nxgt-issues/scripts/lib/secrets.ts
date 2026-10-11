/**
 * Credentials. `scrubTokens` replaces what is recognisably a token (known
 * prefixes, JWTs, long random-looking runs); `findSecrets` names the credential
 * assignments that make a filing refuse instead (`DB_PASS=x`, `"password":
 * "x"`, `Authorization: Bearer x`, a private key block). A refusal reports the
 * keyword, never the value.
 *
 * An assignment whose value is plainly not a secret is let through (see
 * `code-values.ts`): a TS type or a literal word (`password: string`,
 * `session: Session | null`), a reference to the environment
 * (`token: process.env.TOKEN`, `env['X']`), a member expression of letters
 * (`ctx.token`), a call whose quoted arguments are all names
 * (`getToken(c)`, `c.req.header('x-api-key')`, never `hash('hunter2')`), a
 * fallback chain or an index of those (`options.secret ?? defaultSecret`,
 * `tokens[0]`), an object or array opener, a placeholder (`<token>`,
 * `<redacted>`) or a mask (`****`); and a small number or duration for a name
 * that counts something (`tokenTtl: 3600`, `maxToken: 5`). Calls count only on
 * the assignment path: a header, a cookie, a `curl -u` or a `--flag` whose
 * value is a call refuses. Articles and pronouns are not placeholders:
 * `password: the hunter2` refuses. A value may sit on the next line (JSON,
 * YAML). A literal handed to an auth or crypto call refuses wherever the call
 * sits (`auth-calls.ts`).
 */

import { hasSecretArgument } from './auth-calls';
import { isCodeValue, isPlaceholder, wordsOf } from './code-values';
import { hasCredentialPair } from './credential-pairs';

const TOKEN_PATTERNS: readonly RegExp[] = [
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	/\bnpm_[A-Za-z0-9]{20,}\b/g,
	/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	/\bglpat-[A-Za-z0-9_-]{20,}/g,
	/\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
	/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g,
	/\bAIza[0-9A-Za-z_-]{35}/g,
	/\bya29\.[0-9A-Za-z_-]{20,}/g,
	/\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
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

/**
 * The canonical keyword a variable name carries, found as a substring of the
 * lower-cased name: `PGPASSWORD`, `dbpassword`, `client_secret`, `sessionId`.
 * `pass` and `sid` over-match as substrings (`bypass`, `compass`, `inside`), so
 * they count only as a whole word of the name (`DB_PASS`, `sid`) or, for
 * `pass`, as the end of an all-capitals name (`REDISPASS`); `auth` does not
 * count in `author` or `authority`. `key` counts as a whole word of the name
 * (`MASTER_KEY`, `signingKey`, `key`), and so do `signing` and `hmac`
 * (`JWT_SIGNING`).
 */
function keywordOf(name: string): string | undefined {
	const lower = name.toLowerCase();
	const found =
		/password|passwd|passphrase|pwd|secret|token|cookie|session|auth(?!or)/.exec(
			lower,
		);
	if (found) return found[0];
	if (/api[_-]?key/.test(lower)) return 'api-key';
	if (/private[_-]?key/.test(lower)) return 'private-key';
	if (/credential/.test(lower)) return 'credentials';
	if (lower.includes('bearer')) return 'bearer';
	const words = wordsOf(name);
	for (const word of ['pass', 'pw', 'sid']) {
		if (words.includes(word)) return word;
	}
	if (name === name.toUpperCase() && /(?:pass|pw)$/.test(lower)) return 'pass';
	if (words.some((word) => KEY_WORDS.has(word))) return 'key';
	return undefined;
}

const KEY_WORDS = new Set(['key', 'signing', 'hmac']);
/** Words that make any literal under a `key` name a secret: `signingKey = 'users'`. */
const STRONG_KEY = new Set(
	'signing hmac master encryption encrypt cipher crypto aes jwt secret'.split(
		' ',
	),
);

/**
 * A plain `key` name (`key`, `sortKey`, `i18nKey`) names many things that are
 * not secrets, so its value refuses only when it looks like key material:
 * eight or more letters and digits, switching between the two at least twice
 * (`Zq8wLmP3vTnR`, never `tenant1234` or `theme-v2`).
 */
function isNamingKey(name: string, value: string): boolean {
	if (wordsOf(name).some((word) => STRONG_KEY.has(word))) return false;
	const bare = value.replace(/^["'`]|["'`,]+$/g, '');
	const switches = bare.match(/[A-Za-z](?=\d)|\d(?=[A-Za-z])/g)?.length ?? 0;
	return !(/^[A-Za-z\d+/=_]{8,}$/.test(bare) && switches >= 2);
}

/** `name: v`, `name = v`, `'name' => v`; captures the first token and the rest of the value. */
const ASSIGNMENT =
	/(?<![\w-])([\w-]+)\??["']?[ \t]*(?:=>|[:=](?![=>]))[ \t]*(?:\r?\n[ \t]*)?(?=([^\s;}]+)([^\n;}]*))/g;
const AUTHORIZATION =
	/\bAuthorization["']?[ \t]*[:=][ \t]*(?:(?:Basic|Bearer|Digest|Negotiate|token)[ \t]+)?(\S+)/gi;
const COOKIE = /\b(?:Set-)?Cookie["']?[ \t]*:[ \t]*([^\n]+)/gi;
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
/** `curl -u user:pass`. */
const CURL_USER = /\bcurl\b[^\n]*?[ \t](?:-u|--user)[ \t]+(\S+:\S+)/g;
/** `redis-cli -a pass`. */
const REDIS_A = /\bredis-cli\b[^\n]*?[ \t]-a[ \t]+(?!-)\S+/;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/;

/**
 * The credential assignments in already-transformed text, each a reason to
 * refuse, as keywords: `password`, `api-key`, `bearer`, `authorization`...
 */
export function findSecrets(text: string): string[] {
	const found = new Set<string>();
	for (const match of text.matchAll(ASSIGNMENT)) {
		const name = match[1] ?? '';
		const value = match[2] ?? '';
		const whole = `${value}${match[3] ?? ''}`.trim();
		const keyword = keywordOf(name);
		if (!keyword || value.endsWith(':')) continue;
		if (keyword === 'cookie' && value.includes('=')) continue; // the cookie rule decides
		if (keyword === 'key' && isNamingKey(name, whole)) continue;
		if (isCodeValue(whole, { name, first: value })) continue;
		found.add(keyword);
	}
	for (const match of text.matchAll(AUTHORIZATION)) {
		const value = match[1] ?? '';
		if (!isPlaceholder(value) && !TOKEN_WORDS.test(value)) {
			found.add('authorization');
		}
	}
	for (const match of text.matchAll(COOKIE)) {
		// No `name=value` pair: a key in code (`cookie: 'sid'`); the assignment rule decides.
		if (!match[1]?.includes('=')) continue;
		const pairs = (match[1] ?? '')
			.split(';')
			.map((pair) => pair.split('=').pop() ?? '');
		if (!pairs.every(isPlaceholder)) found.add('cookie');
	}
	for (const match of text.matchAll(CURL_USER)) {
		if (!isPlaceholder(match[1]?.split(':')[1] ?? '')) found.add('basic-auth');
	}
	if (REDIS_A.test(text)) found.add('password');
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
	if (hasSecretArgument(text)) found.add('secret-argument');
	if (hasCredentialPair(text)) found.add('credential-pair');
	return [...found];
}
