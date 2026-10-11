/**
 * Comparisons of a credential with a literal anywhere in a filing, not only
 * inside a credential-named function: `if (req.body.password === 'swordfish')`,
 * `if (c.req.header('x-api-key') !== 'acoolproject')`. The other operand is
 * a credential when its last word is one (`operands.ts`) or when it reads a
 * header or a value named like one. A bare `key` is not (`e.key === 'Escape'`).
 * `method === 'GET'` and `role === 'admin'` compare ordinary values and pass.
 */

import { CREDENTIAL_HEADER } from './auth-calls';
import { wordsOf } from './code-values';
import { isHarmlessLiteral } from './literals';
import { CREDENTIAL_WORDS, lastName, pathAtEnd, pathAtStart } from './operands';

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

/** Whether an identifier or header name reads as a credential. */
function namesCredential(name: string): boolean {
	const words = wordsOf(name);
	if (words.length === 1 && words[0] === 'key') return false;
	return words.some((word) => CREDENTIAL_WORDS.has(word));
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
