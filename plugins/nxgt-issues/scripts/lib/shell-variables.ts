/**
 * Shell and compose variables that stand for a secret instead of holding it:
 * `$ADMIN_PASSWORD`, `${NAME}`, `$USER`, and a compose default such as
 * `${REDIS_PASSWORD:-}` or `${JWT_SECRET:?required}`.
 */

import { keywordOf } from './credential-keyword';
import { wordsIn } from './credential-names';

/**
 * A compose or shell expansion that holds no secret: no default (`${NAME}`,
 * `${NAME:-}`, `${NAME=}`) or an error message after `?` (`${NAME:?required}`).
 * A default after `-`, `=` or `+` is a literal value, `${DB_PASSWORD:-swordfish}`
 * (so the well-known `${POSTGRES_PASSWORD:-postgres}` refuses too).
 */
const COMPOSE_DEFAULT =
	/^["'`]?\$\{[A-Z_][A-Z0-9_]*(?::?[-=+]?|:?\?[^}]*)\}?["'`]?$/;
const SHELL_VARIABLE = /^["'`]?\$\$?(\{)?([A-Z_][A-Z0-9_]*)\}?["'`]?$/;
/** Names that read as a credential or an environment setting even without an underscore. */
const ENV_WORDS = new Set(
	'USER PASS PASSWORD PASSWD PWD TOKEN SECRET KEY APIKEY HOME HOST PORT URL'.split(
		' ',
	),
);

/**
 * A shell variable: `$ADMIN_PASSWORD`, `${NAME}`, `$USER`, `$P`. Unbraced, the
 * name needs an underscore, a known environment word or at most two letters,
 * so a password that starts with `$` (`$UPERSECRET`) is not taken for one.
 */
function isShellVariable(value: string): boolean {
	const match = SHELL_VARIABLE.exec(value);
	if (!match) return false;
	const name = match[2] ?? '';
	return (
		match[1] !== undefined ||
		name.includes('_') ||
		name.length <= 2 ||
		ENV_WORDS.has(name)
	);
}

/** A default that holds no secret: an absolute path, a variable, `""`, `<placeholder>`. */
const BENIGN_DEFAULT = /^(?:\/[\w./-]*|\$\{?[A-Za-z_]\w*\}?|""|''|<[^<>]*>)$/;
const PIN = /(?:^|_)PIN$/;
/** `${NAME:-default}` as a whole value, quoted or not, closing brace optional. */
const EXPANSION_VALUE = /^["'`]?\$\{([A-Za-z_]\w*):?[-=+](.*?)\}?["'`]?$/s;

/** A default shaped like an authorization header value, whatever the name: `Basic YWRtaW46…`. */
const SCHEME_DEFAULT =
	/^(?:Basic|Digest|Token|Bearer)[ \t]+([\w.~+/=-]{8,})(?![\w.~+/=-])/;
const SCHEME_WORDS = /^(?:tokens?|auth|authentication|header)\W*$/i;
const SCREAMING = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

/** Base64 that decodes to printable ASCII holding a `user:pass` colon. */
function decodesToUserPass(credential: string): boolean {
	if (credential.length % 4 !== 0 || !/^[A-Za-z0-9+/]+$/.test(credential))
		return false;
	return /^[\x20-\x7e]*:[\x20-\x7e]*$/.test(
		Buffer.from(credential, 'base64').toString('latin1'),
	);
}

/** Whether `value` is a scheme and a credential, as a `Bearer` token is in secrets.ts (a word or `YOUR_TOKEN` is not one). */
export function isSchemeSecret(value: string): boolean {
	const credential = SCHEME_DEFAULT.exec(value.trim())?.[1];
	if (credential === undefined) return false;
	const tokenLike =
		/[\d._~+/=]/.test(credential) ||
		credential.length >= 16 ||
		(/^Basic/i.test(value.trim()) && decodesToUserPass(credential));
	return (
		tokenLike && !SCHEME_WORDS.test(credential) && !SCREAMING.test(credential)
	);
}

/** Last words that make a name a setting, not a credential, whatever words come before. */
const SETTING_WORDS = new Set(
	`file path dir directory name ttl length min max expiry expires issuer audience
	url uri host port user username prefix header type mode enabled algorithm store
	timeout seconds minutes hours days count size limit format label scheme provider
	domain endpoint rounds cost claim field hostname id scopes scope realm in lifetime
	driver secure samesite strategy db`.split(/\s+/),
);

/** Whether the name ends on a setting word (not a vault `secret_id`). */
const isSetting = (words: string[]): boolean =>
	SETTING_WORDS.has(words.at(-1) ?? '') &&
	!(words.at(-1) === 'id' && words.at(-2) === 'secret');

/** Whether the name is a credential: it carries a credential keyword and does not end on a setting word. */
export const namesSecret = (name: string): boolean =>
	(keywordOf(name) !== undefined || PIN.test(name)) &&
	!isSetting(wordsIn(name));

/**
 * Whether an expansion's default is harmless: the name is no credential
 * (`${TOKEN_TTL:-3600}`, `${SECRET_NAME:-app-secrets}`) or the default is
 * benign (`${DB_PASSWORD:-$POSTGRES_PASSWORD}`).
 */
const isBenignExpansion = (name: string, value: string): boolean =>
	!isSchemeSecret(value) &&
	(!namesSecret(name) || BENIGN_DEFAULT.test(value.trim()));

/**
 * The literal default of a whole-value `${NAME:-default}` that is neither
 * empty nor benign, whatever NAME is: under a credential key it is a secret.
 */
export function literalDefaultOf(value: string): string | undefined {
	const match = EXPANSION_VALUE.exec(value);
	const text = (match?.[2] ?? '').trim();
	return text === '' || BENIGN_DEFAULT.test(text) ? undefined : text;
}

/** Whether `value` is a shell variable or an expansion that holds no secret. */
export function isShellValue(value: string): boolean {
	if (isShellVariable(value) || COMPOSE_DEFAULT.test(value)) return true;
	const match = EXPANSION_VALUE.exec(value);
	return match !== null && isBenignExpansion(match[1] ?? '', match[2] ?? '');
}

/** Whether the name at `index` of `text` sits in a `${NAME…}` that is a placeholder (see `COMPOSE_DEFAULT`). */
export function isPlaceholderExpansionAt(text: string, index: number): boolean {
	if (!text.startsWith('${', index - 2)) return false;
	const close = text.indexOf('}', index);
	const end = close === -1 ? text.indexOf('\n', index) : close + 1;
	return isShellValue(text.slice(index - 2, end === -1 ? undefined : end));
}

/**
 * `GITHUB_TOKEN=$(gh auth token) bun run release` (a variable or a command
 * substitution as the first word, then the command it feeds) and the
 * pass-through `PGPASSWORD=$PGPASSWORD psql`.
 */
export function isShellReference(
	name: string,
	value: string,
	isPlaceholder: (value: string) => boolean,
): boolean {
	const unquoted = value.replace(/^["'`]/, '');
	if (!unquoted.startsWith('$')) return false;
	const bare = unquoted.replace(/^\$\{?|\}?["'`]?$/g, '');
	return isPlaceholder(value) || bare === name;
}

/** `${NAME:-default}`, `${NAME:=default}`, `${NAME:+default}`: the default is a literal value. */
const EXPANSION = /\$\{([A-Za-z_]\w*):?[-=+]([^}\n]+)\}/g;

/**
 * The keywords of the `${NAME-default}` expansions in `text` whose default is a
 * literal secret: `keywordOf` names a credential (a `PIN` counts), `isCode`
 * says whether the default is code.
 */
export function secretDefaults(
	text: string,
	keywordOf: (name: string) => string | undefined,
	isCode: (value: string, facts: { name: string; first: string }) => boolean,
): string[] {
	const found: string[] = [];
	for (const match of text.matchAll(EXPANSION)) {
		const name = match[1] ?? '';
		const value = match[2] ?? '';
		if (isBenignExpansion(name, value)) continue;
		if (isSchemeSecret(value)) {
			found.push('authorization');
			continue;
		}
		const keyword = keywordOf(name) ?? (PIN.test(name) ? 'pin' : undefined);
		const facts = { name, first: value.split(/\s/)[0] ?? '' };
		if (keyword && !isCode(value, facts)) found.push(keyword);
	}
	return found;
}
