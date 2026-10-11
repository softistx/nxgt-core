/**
 * Comparisons of a credential with a literal anywhere in a filing, not only
 * inside a credential-named function: `if (req.body.password === 'swordfish')`,
 * `if (c.req.header('x-api-key') !== 'acoolproject')`. The other operand is
 * a credential when its last word is one (`operands.ts`) or when it reads a
 * header or a value named like one, by its last word: `userPassword` and
 * `x-gateway-secret` are, `tokenType`, `passwordStrength` and `sortKey` are not,
 * and a `key` counts only after a qualifier (`apiKey`, `signingKey`). An
 * all-caps literal is a constant (`lexer.token === 'EOF'`).
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
/** A reader call at the end of an operand: `c.req.header('x-api-key')`. */
const READ = /\w\(\s*(["'])([^"'\n]*)\1\s*\)(?:\?\.\w+\(\))?$/;
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

/** Whether the operand ending (or starting) a comparison is a credential. */
function isCredentialOperand(
	read: string | undefined,
	path: string | undefined,
) {
	const header = read === undefined ? undefined : READ.exec(read)?.[2];
	if (header !== undefined) {
		return CREDENTIAL_HEADER.test(header) || namesCredential(header);
	}
	return path !== undefined && namesCredential(lastName(path));
}

const refuses = (match: RegExpMatchArray): boolean =>
	!CONSTANT.test(match[2] ?? '') &&
	!isHarmlessLiteral(match[2] ?? '', { ...VALUE, template: match[1] === '`' });

/** True when a credential is compared with a literal that is not plainly harmless. */
export function hasCredentialComparison(text: string): boolean {
	for (const match of text.matchAll(RIGHT)) {
		const before = text
			.slice(Math.max(0, match.index - WINDOW), match.index)
			.trimEnd();
		if (isCredentialOperand(before, pathAtEnd(before)) && refuses(match)) {
			return true;
		}
	}
	for (const match of text.matchAll(LEFT)) {
		const end = match.index + match[0].length;
		const after = text.slice(end, end + WINDOW).trimStart();
		if (isCredentialOperand(undefined, pathAtStart(after)) && refuses(match)) {
			return true;
		}
	}
	return false;
}
