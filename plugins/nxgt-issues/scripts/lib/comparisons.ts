/**
 * Comparisons of a credential with a literal anywhere in a filing, not only
 * inside a credential-named function: `if (req.body.password === 'swordfish')`,
 * `if (c.req.header('x-api-key') !== 'acoolproject')`. The other operand is
 * a credential when its last word is one (`operands.ts`) or when it reads a
 * header or a value named like one, by its last word: `userPassword` and
 * `x-gateway-secret` are, `tokenType`, `passwordStrength` and `sortKey` are not,
 * and a `key` counts only after a qualifier (`apiKey`, `signingKey`). An
 * all-caps literal is a constant only for a member named exactly `token`
 * (not under `req`, `query`, `body`, `params`,
 * `this` or `env`) and not a header read (`lexer.token === 'EOF'`).
 * `method === 'GET'` and `role === 'admin'` compare ordinary values and pass.
 */

import { CREDENTIAL_HEADER } from './auth-calls';
import { namesCredential } from './credential-names';
import { isHarmlessLiteral } from './literals';
import { lastName, pathAtEnd, pathAtStart } from './operands';

const WINDOW = 120;
const OPERATOR = '(?:===|!==|==|!=)';
const LITERAL = '(["\'`])((?:\\\\.|(?!\\1).)*)\\1';
const RIGHT = new RegExp(`${OPERATOR}[ \\t]*${LITERAL}`, 'g');
const LEFT = new RegExp(`${LITERAL}[ \\t]*${OPERATOR}`, 'g');
/** A read at the end of an operand: `c.req.header('x-api-key')`, `req.headers['x-api-key']`. */
const READ = /(?:\w\(\s*(["'])([^"'\n]*)\1\s*\)|\[\s*(["'])([^"'\n]*)\3\s*\])$/;
/** A method call on an operand: `password.trim()`, `authorization.split(' ')[1]`. */
const METHOD_CALL = /\??\.\w+\([^()\n]*\)(?:\[\d{1,3}\])?$/;
const SCHEME = /^(?:Bearer|Basic|Digest|Negotiate)\s*$/i;
const TOKEN_OWNERS = new Set([
	'req',
	'request',
	'query',
	'body',
	'params',
	'this',
]);
const VALUE = {
	template: false,
	inHeader: false,
	message: false,
	keyPosition: true,
};

/** A token kind or constant: `EOF`, `NUMBER`. */
const CONSTANT = /^[A-Z][A-Z_]+$/;

interface Operand {
	readonly credential: boolean;
	/** A lexer token kind (`tok.token === 'IDENT'`): all-caps literals are constants there. */
	readonly lexer: boolean;
}
const NOT_CREDENTIAL: Operand = { credential: false, lexer: false };

/** Strips method calls until a read (`header('x')`, `['x']`) or a path is left. */
function judge(before: string | undefined, path: string | undefined): Operand {
	let base = before;
	for (let i = 0; base !== undefined && i < 4; i++) {
		const read = READ.exec(base);
		if (read) {
			const header = read[2] ?? read[4] ?? '';
			const credential =
				CREDENTIAL_HEADER.test(header) || namesCredential(header);
			return { credential, lexer: false };
		}
		const stripped = base.replace(METHOD_CALL, '');
		if (stripped === base) break;
		base = stripped;
	}
	const found = base === undefined ? path : pathAtEnd(base);
	if (found === undefined || !namesCredential(lastName(found))) {
		return NOT_CREDENTIAL;
	}
	const owned = found.split(/\??\./).some((part) => TOKEN_OWNERS.has(part));
	return {
		credential: true,
		lexer: found.includes('.') && lastName(found) === 'token' && !owned,
	};
}

const refuses = (match: RegExpMatchArray, operand: Operand): boolean =>
	!(operand.lexer && CONSTANT.test(match[2] ?? '')) &&
	!SCHEME.test(match[2] ?? '') &&
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
