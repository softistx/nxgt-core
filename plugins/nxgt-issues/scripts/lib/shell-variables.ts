/**
 * Shell and compose variables that stand for a secret instead of holding it:
 * `$ADMIN_PASSWORD`, `${NAME}`, `$USER`, and a compose default such as
 * `${REDIS_PASSWORD:-}` or `${JWT_SECRET:?required}`.
 */

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

/** Whether `value` is a shell variable or a compose default with a prose default. */
export const isShellValue = (value: string): boolean =>
	isShellVariable(value) || COMPOSE_DEFAULT.test(value);

/** Whether the name at `index` of `text` sits in a `${NAME…}` that is a placeholder (see `COMPOSE_DEFAULT`). */
export function isPlaceholderExpansionAt(text: string, index: number): boolean {
	if (!text.startsWith('${', index - 2)) return false;
	const close = text.indexOf('}', index);
	const end = close === -1 ? text.indexOf('\n', index) : close + 1;
	return COMPOSE_DEFAULT.test(
		text.slice(index - 2, end === -1 ? undefined : end),
	);
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

/** The non-empty defaults of every `${NAME-default}` expansion in `text`. */
export function expansionDefaults(text: string) {
	return [...text.matchAll(EXPANSION)].map((match) => ({
		name: match[1] ?? '',
		value: match[2] ?? '',
	}));
}
