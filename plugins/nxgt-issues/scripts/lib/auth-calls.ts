/**
 * Literal secrets handed to a credential call, wherever the call sits (an
 * assignment, an `expect`, an object value, a bare statement) and however deep
 * the literal is nested in its arguments (`sign(encode('x'))`,
 * `hash(pw, { salt: Buffer.from('x') })`).
 *
 * A credential call is one whose callee name has a word part that is one of
 * `password`, `passwd`, `secret`, `key`, `token`, `hash`, `hmac`, `cipher`,
 * `sign`, `verify`, `compare`, `encrypt`, `decrypt`, `scrypt`, `pbkdf2`, `argon`,
 * `bcrypt`, `login`, `auth`, `authenticate` (or starts with one, followed by
 * digits, `iv`, `s`, `ed`, `er`, `ing`: `argon2`, `createCipheriv`, `hashed`);
 * or `btoa`, `encode`, `Buffer.from` (the last two refuse only a literal that
 * looks like a credential: `user:pass`, a secret word, letters with digits). A header setter (`.set`, `.append`,
 * `header`, `setHeader`) whose first argument names a credential header
 * (`authorization`, `cookie`, `x-api-key`, `*-secret`, `*-token`, `*-key`,
 * `*-password`), `res.cookie(name, value)`, and a setter called on a cookie
 * jar (`cookies.set('sid', …)`) is one too, for its value.
 *
 * Every quoted literal inside it refuses unless `literals.ts` says it is
 * plainly not a secret, or it is the value of a naming option (`audience`,
 * `issuer`, `algorithm`, `expiresIn`, …; never `salt`, `secret`, `key`). A
 * header's value is held to the strict rule only when it is the literal
 * itself, not a literal nested in a call that builds it. The first argument of `login`, `signIn` and
 * `authenticate` is the user name and stays allowed.
 */

import { credentialKeyHoldsSecret, functionRegions } from './function-values';
import { comparesSecret, valueRoles } from './literal-roles';
import { isHarmlessLiteral, looksLikeCredential } from './literals';

const CALL = /(?<![\w$])((?:[A-Za-z_$][\w$]*\??\.)*[A-Za-z_$][\w$]*)\s*\(/g;
const KEYWORDS = (
	'password passwd secret key token hash hmac cipher sign signature verify compare encrypt ' +
	'decrypt scrypt pbkdf2 argon bcrypt login auth authenticate'
).split(' ');
const SUFFIX = /^(?:\d+|iv|sync|ed|er|ing|s)?$/;
const USER_FIRST = new Set(['login', 'signIn', 'authenticate']);
const SETTERS = new Set(['set', 'append', 'header', 'setHeader', 'cookie']);
/** An identifier naming a credential header: `GATEWAY_SECRET_HEADER`, `authHeader`. */
const CREDENTIAL_NAME = /^[A-Za-z_$][\w$.]*$/;
const CREDENTIAL_WORD =
	/secret|token|passw|api_?key|auth(?!or)|cookie|session/i;
export const namesCredential = (identifier: string): boolean =>
	CREDENTIAL_NAME.test(identifier) && CREDENTIAL_WORD.test(identifier);
export const CREDENTIAL_HEADER =
	/^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|.*-(?:secret|token|key|password))$/i;

const parts = (name: string): string[] =>
	name
		.replace(/([a-z\d])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z\d]+/)
		.filter(Boolean);

/** Whether a callee path names a credential call. */
export function isCredentialCallee(path: string): boolean {
	const name = path.split('.').pop() ?? '';
	if (name === 'btoa' || name === 'encode') return true;
	if (/(?:^|\.)Buffer\.from$/.test(path)) return true;
	return parts(name).some((part) =>
		KEYWORDS.some(
			(kw) => part.startsWith(kw) && SUFFIX.test(part.slice(kw.length)),
		),
	);
}

const OPEN = '([{';
const CLOSE = ')]}';
const MAX_SCAN = 2000;

/** Walks `text` from `start`, calling `step` with each character outside quotes and its depth. */
function scan(
	text: string,
	start: number,
	step: (char: string, index: number, depth: number) => boolean | undefined,
): void {
	let depth = 0;
	let quote = '';
	for (let i = start; i < Math.min(text.length, start + MAX_SCAN); i++) {
		const char = text[i] ?? '';
		if (quote) {
			if (char === '\\') i++;
			else if (char === quote) quote = '';
			continue;
		}
		if (char === "'" || char === '"' || char === '`') quote = char;
		else if (OPEN.includes(char)) depth++;
		else if (CLOSE.includes(char)) depth--;
		if (step(char, i, depth)) return;
	}
}

/** The top-level arguments of a call whose `(` ends just before `start`. */
export function callArguments(text: string, start: number): string[] {
	const args: string[] = [];
	let from = start;
	let end = Math.min(text.length, start + MAX_SCAN);
	scan(text, start, (char, i, depth) => {
		if (depth < 0) {
			end = i;
			return true;
		}
		if (char === ',' && depth === 0) {
			args.push(text.slice(from, i).trim());
			from = i + 1;
		}
		return undefined;
	});
	const last = text.slice(from, end).trim();
	if (last) args.push(last);
	return args;
}

const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/gs;
const literalOf = (arg: string): string | undefined =>
	/^(["'`])((?:\\.|(?!\1).)*)\1$/s.exec(arg)?.[2];

/** Option keys whose values name things (an audience, an algorithm), never a secret. */
const NAMING_KEYS = new Set(
	(
		'audience aud issuer iss subject sub algorithm algorithms alg typ type ' +
		'encoding expiresIn notBefore sameSite path scope name hash kid keyid ' +
		'format mode role provider strategy message jwtid jti'
	).split(' '),
);
const KEY_BEFORE = /([A-Za-z_$][\w$]*)["']?\s*:\s*\[?\s*$/;
const MESSAGE_KEYS = new Set(['message', 'error', 'description']);

/** Where an argument sits in its call, which decides what its literals may be. */
interface Position {
	/** A credential header's own value. */
	readonly strict: boolean;
	/** A key, secret or password position. */
	readonly key: boolean;
	/** An argument of `encode` or `Buffer.from`: ordinary text passes. */
	readonly encoder?: boolean;
}

/** A quoted literal in `arg` that is a secret. */
function hasSecretIn(arg: string, position: Position): boolean {
	const regions = functionRegions(arg);
	const roles =
		regions.length > 0 ? valueRoles(arg, isCredentialCallee) : undefined;
	for (const match of arg.matchAll(QUOTED)) {
		const inFunction = regions.some(
			([a, b]) => match.index > a && match.index < b,
		);
		const role = inFunction ? roles?.get(match.index) : undefined;
		if (inFunction && !role) continue; // a key inside a function value: `c.req.header('x-gateway')`
		const key = KEY_BEFORE.exec(arg.slice(0, match.index))?.[1];
		if (key && NAMING_KEYS.has(key)) continue;
		const message = key !== undefined && MESSAGE_KEYS.has(key);
		const context = {
			template: match[1] === '`',
			inHeader: position.strict && match[0] === arg,
			message,
			keyPosition: position.key && !message,
		};
		const literal = match[2] ?? '';
		if (isHarmlessLiteral(literal, context)) continue;
		if (role === 'compare' && !comparesSecret(literal)) continue;
		if (!position.encoder || looksLikeCredential(literal)) return true;
	}
	return false;
}

const hasPart = (callee: string[], words: readonly string[]): boolean =>
	callee.some((part) =>
		words.some((w) => part.startsWith(w) && SUFFIX.test(part.slice(w.length))),
	);
const KEY_PARTS =
	'sign signature hash hmac cipher password verify webhook'.split(' ');

/** The position of each argument of a credential call. */
function positionsOf(name: string, args: string[]): Position[] {
	const callee = parts(name);
	const firstIsCode = literalOf(args[0] ?? '') === undefined;
	const keyCall = hasPart(callee, KEY_PARTS);
	const encoder = name === 'encode' || name === 'from';
	return args.map((_, index) => ({
		strict: false,
		encoder,
		key: keyCall || (USER_FIRST.has(name) && index > 0 && !firstIsCode),
	}));
}

/** True when a credential call in `text` is handed a literal secret. */
export function hasSecretArgument(text: string): boolean {
	if (credentialKeyHoldsSecret(text, isCredentialCallee)) return true;
	for (const match of text.matchAll(CALL)) {
		const path = match[1] ?? '';
		const name = path.split('.').pop() ?? '';
		const args = callArguments(text, match.index + match[0].length);
		const header = literalOf(args[0] ?? '');
		const cookieJar =
			name === 'cookie' || /cookie/i.test(path.slice(0, -name.length));
		const credentialHeader = header
			? cookieJar || CREDENTIAL_HEADER.test(header)
			: namesCredential(args[0] ?? '');
		if (SETTERS.has(name) && credentialHeader) {
			const value = { strict: true, key: false };
			if (hasSecretIn(args[1] ?? '', value)) return true;
			continue;
		}
		if (!isCredentialCallee(path)) continue;
		const positions = positionsOf(name, args);
		for (const [index, arg] of args.entries()) {
			if (index === 0 && USER_FIRST.has(name)) continue;
			const position = positions[index];
			if (position && hasSecretIn(arg, position)) return true;
		}
	}
	return false;
}
