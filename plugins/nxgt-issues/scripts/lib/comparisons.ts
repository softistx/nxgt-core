/**
 * Comparisons of a credential with a literal anywhere in a filing, not only
 * inside a credential-named function: `if (req.body.password === 'swordfish')`,
 * `if (c.req.header('x-api-key') !== 'acoolproject')`. The other operand is
 * a credential when its last word is one (`operands.ts`) or when it reads a
 * header or a value named like one, by its last word: `userPassword` and
 * `x-gateway-secret` are, `tokenType`, `passwordStrength` and `sortKey` are not,
 * and a `key` counts only after a qualifier (`apiKey`, `signingKey`). An
 * all-caps literal is a constant only for a member ending in `token` that is
 * neither a header read nor an env read (`lexer.token === 'EOF'`).
 * `method === 'GET'` and `role === 'admin'` compare ordinary values and pass.
 */

import { CREDENTIAL_HEADER } from './auth-calls';
import { wordsOf } from './code-values';
import { isHarmlessLiteral } from './literals';
import { lastName, pathAtEnd, pathAtStart } from './operands';

const WINDOW = 120;
const OPERATOR = '(?:===|!==|==|!=)';
const LITERAL = '(["\'`])((?:\\\\.|(?!\\1).)*)\\1';
const RIGHT = new RegExp(`${OPERATOR}[ \\t]*${LITERAL}`, 'g');
const LEFT = new RegExp(`${LITERAL}[ \\t]*${OPERATOR}`, 'g');
/** A read at the end of an operand: `c.req.header('x-api-key')`, `req.headers['x-api-key']`. */
const READ = /(?:\w\(\s*(["'])([^"'\n]*)\1\s*\)|\[\s*(["'])([^"'\n]*)\3\s*\])$/;
/** No-argument method calls on an operand: `password.trim()`, `x?.toLowerCase()`. */
const METHOD_CALLS = /(?:\??\.\w+\(\s*\))+$/;
const ENV_PATH = /(?:^|\.)env(?:\.|$)/;
const VALUE = {
	template: false,
	inHeader: false,
	message: false,
	keyPosition: true,
};

/** The last words that make a name a credential: `userPassword`, `apiKey`, `x-gateway-secret`. */
const LAST_WORDS = new Set(
	'password pass passwd pwd secret token apikey'.split(' '),
);
/** A `key` is a credential only after one of these, as in key-names.ts (`sortKey` is not). */
const KEY_QUALIFIERS = new Set(
	'api secret private signing access encryption hmac master'.split(' '),
);
/** A token kind or constant: `EOF`, `NUMBER`. */
const CONSTANT = /^[A-Z][A-Z_]+$/;

/**
 * Whether an identifier or header name reads as a credential: by its last
 * word only (`tokenType`, `passwordStrength` and `secretManager` are not).
 */
function namesCredential(name: string): boolean {
	const words = wordsOf(name);
	const last = words.at(-1) ?? '';
	if (last === 'key') return KEY_QUALIFIERS.has(words.at(-2) ?? '');
	return LAST_WORDS.has(last);
}

interface Operand {
	readonly credential: boolean;
	/** A lexer token kind (`tok.token === 'IDENT'`): all-caps literals are constants there. */
	readonly lexer: boolean;
}
const NOT_CREDENTIAL: Operand = { credential: false, lexer: false };

/** Judges the operand `before` an operator (a read or a path) or `path` after one. */
function judge(before: string | undefined, path: string | undefined): Operand {
	const base = before?.replace(METHOD_CALLS, '');
	const read = base === undefined ? undefined : READ.exec(base);
	if (read) {
		const header = read[2] ?? read[4] ?? '';
		const credential =
			CREDENTIAL_HEADER.test(header) || namesCredential(header);
		return { credential, lexer: false };
	}
	const found = base === undefined ? path : pathAtEnd(base);
	if (found === undefined || !namesCredential(lastName(found))) {
		return NOT_CREDENTIAL;
	}
	const token = wordsOf(lastName(found)).at(-1) === 'token';
	return {
		credential: true,
		lexer: token && found.includes('.') && !ENV_PATH.test(found),
	};
}

const refuses = (match: RegExpMatchArray, operand: Operand): boolean =>
	!(operand.lexer && CONSTANT.test(match[2] ?? '')) &&
	!isHarmlessLiteral(match[2] ?? '', { ...VALUE, template: match[1] === '`' });

/** True when a credential is compared with a literal that is not plainly harmless. */
export function hasCredentialComparison(text: string): boolean {
	for (const match of text.matchAll(RIGHT)) {
		const before = text
			.slice(Math.max(0, match.index - WINDOW), match.index)
			.trimEnd();
		const operand = judge(before, undefined);
		if (operand.credential && refuses(match, operand)) return true;
	}
	for (const match of text.matchAll(LEFT)) {
		const end = match.index + match[0].length;
		const after = text.slice(end, end + WINDOW).trimStart();
		const operand = judge(undefined, pathAtStart(after));
		if (operand.credential && refuses(match, operand)) return true;
	}
	return false;
}
