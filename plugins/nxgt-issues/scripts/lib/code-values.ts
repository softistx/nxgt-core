/**
 * Whether the value of a credential-named assignment is code that reads or
 * types a secret rather than the secret itself. `isPlaceholder` is the narrow
 * test every rule of `secrets.ts` shares (a type word, an env reference, a
 * member expression of letters, `<redacted>`, a mask). `isCodeValue` widens it
 * for the assignment path only, never for a header, a cookie, a `curl -u` or a
 * `--flag`:
 *
 * - a call whose parentheses close, when every quoted argument is letters only
 *   (or a known encoding or algorithm name, or a header or key name given to a
 *   reader such as `header()`/`get()`), and no bare argument mixes letters and
 *   digits (`P4ss(w0rd)`): `getToken(c)`, `createHash('sha256')`, but not
 *   `bcrypt.hash('Admin123!', 10)` or `encode('jwt-secret')`;
 * - a TypeScript type (`Session | null`, `Map<string, Session>`, `Cookie[]`,
 *   or `Session` for a name of the same word), optionally followed by
 *   `= <value>`, which is then judged on its own;
 * - a fallback chain whose first operand is code and whose later ones are code
 *   or bare identifiers of letters (`options.secret ?? defaultSecret`);
 * - an env read with a non-null `!` or a bracket (`env['X']`), an index into a
 *   letters-only name (`tokens[0]`), the name itself (`secret: secret,`);
 * - a small number for a name that counts something (`sessionTtl: 3600,`), and
 *   a quoted cookie name for a key whose name ends in `cookie` (`cookie: 'sid'`).
 */

const WORDS = new Set(
	(
		'string number boolean bigint symbol object array function void never ' +
		'undefined null unknown any true false required optional missing invalid ' +
		'empty expired incorrect wrong none yes no await new async typeof'
	).split(' '),
);

const PRIMITIVES = new Set(
	'string number boolean bigint symbol object unknown any never void null undefined'.split(
		' ',
	),
);

/** Whole words of a name that mark it as a count, size or duration. */
const QUANTITY = new Set(
	(
		'max min ttl length size count limit expiry expires expire expiration ' +
		'timeout interval rounds age len num retries attempts ' +
		'tokens sessions secrets passwords cookies'
	).split(' '),
);
const SMALL_NUMBER = /^(?:\d{1,4}|\d{1,6}(?:ms|s|m|h|d))$/i;

/** Literals a call may carry although they hold digits or dashes. */
export const KNOWN_LITERALS: ReadonlySet<string> = new Set(
	(
		'hex base64 base64url utf8 utf-8 utf16le latin1 ascii binary ' +
		'sha1 sha256 sha384 sha512 md5 hs256 hs384 hs512 rs256 rs512 es256 es384 ' +
		'eddsa ed25519 aes-256-gcm aes-128-gcm pbkdf2 scrypt argon2id hmac-sha256'
	).split(' '),
);

/** Methods whose first argument is the name of what they read, not a value. */
const READERS = new Set(
	'header get getHeader cookie getCookie query param getenv getItem has'.split(
		' ',
	),
);

/** The words of a name: split on separators and camelCase seams, lower-cased. */
export const wordsOf = (name: string): string[] =>
	name
		.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

/** A member expression of letters only: `ctx.token`, `config.secret`. */
const MEMBER = /^[A-Za-z_$]+(?:\??\.[A-Za-z_$]+){1,3}$/;
const ENV = /^(?:[\w$]+\.)*env\.[\w$]+$/i;
/** A shell variable (`$PASS`, `${ADMIN_PASSWORD}`) or a command substitution, quoted or not. */
const SHELL_VARIABLE = /^["'`]?\$\{?[A-Z_][A-Z0-9_]*\}?["'`]?$/;
const COMMAND_SUBSTITUTION = /^["'`]?\$\(/;
const ENV_BRACKET = /^(?:[\w$]+\.)*env\[\s*(["'])\w+\1\s*\]$/;

/** True when `value` cannot be a secret: a type, a word, an env reference, a mask. */
export function isPlaceholder(raw: string): boolean {
	const unwrapped = raw
		.replace(/^(?:await|new|typeof)\s+/i, '')
		.replace(/[\s,;]+$/, '');
	const asserted = unwrapped.replace(/!$/, '');
	if (
		ENV_BRACKET.test(asserted) ||
		SHELL_VARIABLE.test(asserted) ||
		COMMAND_SUBSTITUTION.test(asserted)
	)
		return true;
	const value = unwrapped
		.replace(/(?:\[\])+(?=[;,)}\]"'`]*$)/, '')
		.replace(/^["'`]+|["'`;,)}\]]+$/g, '')
		.toLowerCase();
	const bare = value.replace(/!$/, '');
	return (
		value === '' ||
		WORDS.has(value) ||
		/^[{[]/.test(value) ||
		MEMBER.test(bare) ||
		/^<[^<>]{0,40}>$/.test(value) ||
		/^[*•x]{3,}$|^\.{3}$|^…$/.test(value) ||
		ENV.test(bare)
	);
}

/** A call on an identifier path whose parentheses close: `getToken(c)`, `c.req.header('x')?.slice(7)`. */
const CALL =
	/^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\(.*\)(?:\[\d{1,3}\])?$/;
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;

/** Prefixes of provider tokens: `sk-live-…` is a key, not a header name. */
const TOKEN_PREFIX =
	/^(?:sk|pk|rk|ghp|gho|ghs|ghu|ghr|github|xox[abprs]|npm|glpat|akia)[-_]/i;
/** One segment of a header, cookie or key name: `x`, `API`, `Key`, `refreshToken`. */
const NAME_SEGMENT = /^(?:[a-z]+(?:[A-Z][a-z]+)*|[A-Z]+|[A-Z][a-z]+)$/;

/** The first argument of a reader: a plain name, never a token-shaped string. */
export function isReaderKey(text: string): boolean {
	if (TOKEN_PREFIX.test(text)) return false;
	return text.split(/[-_.]/).every((segment) => NAME_SEGMENT.test(segment));
}

/** Literals that carry no value: empty, blank, or a bare scheme word (`'Bearer '`). */
const NO_VALUE = /^\s*(?:(?:Basic|Bearer|Digest|Negotiate|token)\s*)?$/i;

function quotedArgumentIsName(call: string, index: number, text: string) {
	if (KNOWN_LITERALS.has(text.toLowerCase()) || NO_VALUE.test(text)) {
		return true;
	}
	const method = /([A-Za-z_$][\w$]*)\(\s*$/.exec(call.slice(0, index))?.[1];
	if (method && READERS.has(method)) return isReaderKey(text);
	return /^[A-Za-z]+$/.test(text);
}

/** A call that reads a secret: every literal a name, no bare `P4ss`-like word. */
export function isSafeCall(raw: string): boolean {
	const call = raw.replace(/^(?:await|new)\s+/i, '').replace(/[\s,;]+$/, '');
	if (!CALL.test(call)) return false;
	for (const match of call.matchAll(QUOTED)) {
		if (!quotedArgumentIsName(call, match.index, match[2] ?? '')) return false;
	}
	const bare = call.replace(QUOTED, '""');
	if (/["'`]/.test(bare.replace(/""/g, ''))) return false; // an unclosed quote
	for (const word of bare.match(/[A-Za-z_$][\w$]*/g) ?? []) {
		if (
			/[A-Za-z]\d+[A-Za-z]/.test(word) &&
			!KNOWN_LITERALS.has(word.toLowerCase())
		)
			return false;
	}
	return true;
}

const isCode = (value: string): boolean =>
	isPlaceholder(value) || isSafeCall(value);

/** A TypeScript type: primitives and PascalCase names joined by `|`, `&`, `<>`, `,`, `[]`. */
function isType(value: string, name: string): boolean {
	if (!/^[A-Za-z<>[\]|&, ]+$/.test(value)) return false;
	const words = value.match(/[A-Za-z]+/g) ?? [];
	const typed = words.every(
		(w) => PRIMITIVES.has(w) || /^[A-Z][A-Za-z]*$/.test(w),
	);
	if (!typed) return false;
	if (/[|&<[]/.test(value) || PRIMITIVES.has(value)) return true;
	return value.toLowerCase() === name.toLowerCase();
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z$]*$/;
const INDEXED =
	/^[A-Za-z_$][A-Za-z$]*(?:\.[A-Za-z_$][A-Za-z$]*)*\[(?:\d{1,3}|[A-Za-z_$][A-Za-z$]*)\]$/;

function isFallbackChain(value: string): boolean {
	const operands = value.split(/\s*(?:\?\?|\|\|)\s*/);
	if (operands.length < 2) return false;
	const [first = '', ...rest] = operands;
	return isCode(first) && rest.every((op) => isCode(op) || IDENTIFIER.test(op));
}

export interface AssignmentFacts {
	/** The variable or key name, as written. */
	readonly name: string;
	/** The first token of the value, which the small-number rule reads. */
	readonly first: string;
}

/** The assignment-path test: true when `whole` is code, not a credential. */
export function isCodeValue(whole: string, facts: AssignmentFacts): boolean {
	const value = whole.trim().replace(/[\s,;]+$/, '');
	if (isCode(value)) return true;
	const typed = /^(.*?)\s*=\s*(?![=>])(.+)$/.exec(value);
	if (typed?.[1] && typed[2] && isType(typed[1], facts.name)) {
		return isCodeValue(typed[2], facts);
	}
	if (isType(value, facts.name)) return true;
	if (isFallbackChain(value) || INDEXED.test(value)) return true;
	if (
		IDENTIFIER.test(value) &&
		value.toLowerCase() === facts.name.toLowerCase()
	)
		return true;
	const quantity = wordsOf(facts.name).some((word) => QUANTITY.has(word));
	const first = facts.first.replace(/[,;]+$/, '');
	if (quantity && SMALL_NUMBER.test(first)) return true;
	return (
		/cookie$/i.test(facts.name) &&
		/^(["'])[A-Za-z][A-Za-z_.-]{0,39}\1$/.test(value)
	);
}
