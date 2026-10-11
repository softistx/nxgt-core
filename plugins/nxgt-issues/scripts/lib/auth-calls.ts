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
 * or `btoa`, `encode`, `Buffer.from`. A header setter (`.set`, `.append`,
 * `header`, `setHeader`) whose first argument names a credential header
 * (`authorization`, `cookie`, `x-api-key`, `*-secret`, `*-token`, `*-key`,
 * `*-password`), or that is called on a cookie jar (`cookies.set('sid', …)`),
 * is one too, for its value.
 *
 * Every quoted literal inside it refuses unless `literals.ts` says it is
 * plainly not a secret, or it is the value of a naming option (`audience`,
 * `issuer`, `algorithm`, `expiresIn`, …; never `salt`, `secret`, `key`). A
 * header's value is held to the strict rule only when it is the literal
 * itself, not a literal nested in a call that builds it. The first argument of `login`, `signIn` and
 * `authenticate` is the user name and stays allowed.
 */

import { isHarmlessLiteral } from './literals';

const CALL = /(?<![\w$])((?:[A-Za-z_$][\w$]*\??\.)*[A-Za-z_$][\w$]*)\s*\(/g;
const KEYWORDS = (
	'password passwd secret key token hash hmac cipher sign verify compare encrypt ' +
	'decrypt scrypt pbkdf2 argon bcrypt login auth authenticate'
).split(' ');
const SUFFIX = /^(?:\d+|iv|sync|ed|er|ing|s)?$/;
const USER_FIRST = new Set(['login', 'signIn', 'authenticate']);
const SETTERS = new Set(['set', 'append', 'header', 'setHeader']);
const CREDENTIAL_HEADER =
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
		'format mode role provider strategy message'
	).split(' '),
);
const KEY_BEFORE = /([A-Za-z_$][\w$]*)["']?\s*:\s*\[?\s*$/;

/** A quoted literal in `arg` that is a secret; `strict` for a header's own value. */
function hasSecretIn(arg: string, strict: boolean): boolean {
	for (const match of arg.matchAll(QUOTED)) {
		const key = KEY_BEFORE.exec(arg.slice(0, match.index))?.[1];
		if (key && NAMING_KEYS.has(key)) continue;
		const template = match[1] === '`';
		const inHeader = strict && match[0] === arg;
		if (!isHarmlessLiteral(match[2] ?? '', { template, inHeader })) return true;
	}
	return false;
}

/** True when a credential call in `text` is handed a literal secret. */
export function hasSecretArgument(text: string): boolean {
	for (const match of text.matchAll(CALL)) {
		const path = match[1] ?? '';
		const name = path.split('.').pop() ?? '';
		const args = callArguments(text, match.index + match[0].length);
		const header = literalOf(args[0] ?? '');
		const cookieJar = /cookie/i.test(path.slice(0, -name.length));
		if (
			SETTERS.has(name) &&
			header &&
			(cookieJar || CREDENTIAL_HEADER.test(header))
		) {
			if (hasSecretIn(args[1] ?? '', true)) return true;
			continue;
		}
		if (!isCredentialCallee(path)) continue;
		for (const [index, arg] of args.entries()) {
			if (index === 0 && USER_FIRST.has(name)) continue;
			if (hasSecretIn(arg, false)) return true;
		}
	}
	return false;
}
