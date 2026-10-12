/**
 * TypeScript types in an assignment-shaped match: `token: string`, `secret:
 * Buffer`, `session: Session | null`, and a parameter or member typed with a
 * name (`(token: AccessToken)`, `constructor(private readonly secret:
 * ConfigService)`, `type Session = { token: SessionToken; }`).
 *
 * Primitives and known types (`Buffer`, `KeyObject`, `CryptoKey`, typed arrays)
 * are accepted wherever they stand. A name of two or more capitalised words is
 * accepted only in a signature: after a `:` (never `=`), under a name that is
 * not SCREAMING_SNAKE, inside a parameter list (anonymous, a `constructor`, a
 * `function`, or one followed by `{` or `=>`) or a `type X = {` /
 * `interface X {` / `class X {` body, or a `let|const|var` declaration. `Config(host=db, password=CorrectHorse)`, `{ password:
 * CorrectHorse }` and `login(password: CorrectHorse)` are values.
 */

const PRIMITIVES = new Set(
	'string number boolean bigint symbol object unknown any never void null undefined'.split(
		' ',
	),
);
export const isPrimitive = (word: string): boolean => PRIMITIVES.has(word);

/** Types a parameter named like a credential may have besides the primitives. */
const KNOWN_TYPES = new Set(
	(
		'Buffer KeyObject CryptoKey CryptoKeyPair JsonWebKey ArrayBuffer ' +
		'SharedArrayBuffer DataView Secret KeyLike Date'
	).split(' '),
);
/** A name of two or more capitalised words: `AccessToken`, `ConfigService`; a lone `Swordfish` may be a value. */
const COMPOUND_TYPE = /^(?:[A-Z][a-z]+){2,}$/;
const TYPED_ARRAY = /^(?:Uint|Int|Float|BigInt|BigUint)\d*(?:Clamped)?Array$/;
const TYPE_PART = '[A-Za-z_$][\\w$.]*(?:<[^<>]*>)?(?:\\[\\])*';
/** A type followed by the `)` or `,` that ends a parameter: `string) {`, `Buffer, token?: string)`. */
const PARAMETER_TYPE = new RegExp(
	`^(${TYPE_PART}(?:\\s*[|&]\\s*${TYPE_PART})*)\\s*[),]`,
);
const TYPE_LITERAL =
	/(?:\btype\s+[\w$]+(?:<[^<>]*>)?\s*=|\binterface\s+[\w$]+(?:<[^<>]*>)?(?:\s+extends\s+[\w$.,<>\s]+?)?|\bclass\s+[\w$]+(?:<[^<>]*>)?(?:\s+extends\s+[\w$.<>]+)?(?:\s+implements\s+[\w$.,<>\s]+?)?)\s*$/;
/** `let token: …`, `declare const token: …` at the start of a statement. */
const DECLARATION = /(?:^|[;{}\n]\s*)(?:declare\s+)?(?:let|const|var)\s+$/;
const WINDOW = 600;

/** A TypeScript type: primitives and PascalCase names joined by `|`, `&`, `<>`, `,`, `[]`. */
export function isType(value: string, name: string): boolean {
	if (!/^[A-Za-z<>[\]|&, ]+$/.test(value)) return false;
	const words = value.match(/[A-Za-z]+/g) ?? [];
	const typed = words.every(
		(w) => PRIMITIVES.has(w) || /^[A-Z][A-Za-z]*$/.test(w),
	);
	if (!typed) return false;
	if (/[|&<[]/.test(value) || PRIMITIVES.has(value)) return true;
	return value.toLowerCase() === name.toLowerCase();
}

/** Where an assignment sits in its text: its name starts at `start`, its value ends at `end`. */
export interface Site {
	readonly text: string;
	readonly start: number;
	readonly end: number;
}

/** The nearest `(`, `[` or `{` before `start` that nothing has closed. */
function enclosing(text: string, start: number) {
	let depth = 0;
	for (let i = start - 1; i >= Math.max(0, start - WINDOW); i--) {
		const char = text[i] ?? '';
		if (')]}'.includes(char)) depth++;
		else if ('([{'.includes(char)) {
			if (depth === 0) return { char, index: i };
			depth--;
		}
	}
	return undefined;
}

/** Whether the parenthesis opened at `open` starts a parameter list, not a call. */
function isParameterList(text: string, open: number): boolean {
	const head = text.slice(Math.max(0, open - 80), open).trimEnd();
	const callee = /([A-Za-z_$][\w$]*)$/.exec(head)?.[1];
	if (callee === undefined || callee === 'constructor') return true;
	if (/\bfunction\s*\*?\s*[\w$]*$/.test(head)) return true;
	let depth = 0;
	let close = -1;
	for (let i = open; i < Math.min(text.length, open + WINDOW); i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')' && --depth === 0) {
			close = i;
			break;
		}
	}
	const after = text.slice(close + 1, close + 120);
	return close !== -1 && /^\s*(?::\s*[^{;=]+?)?\s*(?:\{|=>)/.test(after);
}

/** Whether `name` is declared with a type here: a parameter or a type-literal member. */
function inSignature(name: string, site: Site): boolean {
	const { text, start } = site;
	if (!/^\??\s*:/.test(text.slice(start + name.length))) return false;
	if (/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
	if (DECLARATION.test(text.slice(Math.max(0, start - 40), start))) return true;
	const open = enclosing(text, start);
	if (open?.char === '(') return isParameterList(text, open.index);
	if (open?.char !== '{') return false;
	return TYPE_LITERAL.test(
		text.slice(Math.max(0, open.index - 120), open.index),
	);
}

/** `function f(token: string) {`: the value is the type of a parameter, not a secret. */
export function isTypedParameter(
	whole: string,
	name: string,
	site?: Site,
): boolean {
	const ends = site !== undefined && site.text[site.end] === ';'; // `{ token: SessionToken; }`
	const type = PARAMETER_TYPE.exec(ends ? `${whole})` : whole)?.[1];
	if (type === undefined) return false;
	const compound = site !== undefined && inSignature(name, site);
	const words = type.match(/[A-Za-z_$][\w$]*/g) ?? [];
	const known = words.every(
		(w) =>
			PRIMITIVES.has(w) ||
			KNOWN_TYPES.has(w) ||
			TYPED_ARRAY.test(w) ||
			(compound && COMPOUND_TYPE.test(w)),
	);
	return known || isType(type, name);
}
