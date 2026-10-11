/**
 * Shell and compose variables that stand for a secret instead of holding it:
 * `$ADMIN_PASSWORD`, `${NAME}`, `$USER`, and a compose default such as
 * `${REDIS_PASSWORD:-}` or `${JWT_SECRET:?required}`.
 */

/** A compose or shell default: `${REDIS_PASSWORD:-}`, `${JWT_SECRET:?required}`; the default is prose. */
const COMPOSE_DEFAULT =
	/^["'`]?\$\{[A-Z_][A-Z0-9_]*:?[-?+=][A-Za-z ]*\}?["'`]?$/;
const SHELL_VARIABLE = /^["'`]?\$(\{)?([A-Z_][A-Z0-9_]*)\}?["'`]?$/;
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
