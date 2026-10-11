import { wordsIn } from './credential-names';

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
export function keywordOf(name: string): string | undefined {
	const lower = name.toLowerCase();
	if (wordsIn(name).some((word) => /^o?auth\d?$/.test(word))) return 'auth';
	const found =
		/password|passwd|passphrase|pwd|secret|token|cookie|session/.exec(lower);
	if (found) return found[0];
	if (/api[_-]?key/.test(lower)) return 'api-key';
	if (/private[_-]?key/.test(lower)) return 'private-key';
	if (/credential/.test(lower)) return 'credentials';
	if (lower.includes('bearer')) return 'bearer';
	const words = wordsIn(name);
	for (const word of ['pass', 'pw', 'sid']) {
		if (words.includes(word)) return word;
	}
	if (name === name.toUpperCase() && /(?:pass|pw)$/.test(lower)) return 'pass';
	if (words.some((word) => KEY_WORDS.has(word))) return 'key';
	return undefined;
}

const KEY_WORDS = new Set(['key', 'signing', 'hmac']);
