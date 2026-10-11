/**
 * The quoted literals a credential call may carry because they are plainly
 * not secrets: a placeholder (`'<secret>'`, `'****'`), an algorithm, cipher,
 * encoding or key-format name (`'sha256'`, `'sha3-256'`, `'aes-256-gcm'`,
 * `'raw'`, `'HMAC'`), a locale tag or collation word (`'en'`, `'fr-CA'`,
 * `'base'`), a short role word (`'admin'`, `'magic-link'`,
 * `'session-cookie'`), a duration (`'1h'`), an environment variable name
 * (`'JWT_SECRET'`), the empty string, a message with a space
 * (`'Signature is invalid'`), and a template whose fixed text holds no
 * letters-and-digits run (`` `${user}:${pass}` ``, `` `Bearer ${token}` ``).
 * In a credential header's value only the placeholder and the template rules
 * apply: `'Basic x'` and `'abc'` are credentials there. The caller says where
 * the literal sits: a space excuses it only under a `message`, `error` or
 * `description` key and never in a key position (so `verify(sig, 'Signature
 * is invalid')` refuses: a secret can hold spaces too), and in a
 * key position (the secret of `sign`, `hash`, `hmac`, a cipher, a password
 * call, the password of `login`) a role word, a locale or an env name is a
 * secret too (`jwt.sign(p, 'admin')`).
 */

import { isPlaceholder, KNOWN_LITERALS } from './code-values';

const CRYPTO_WORDS = new Set(
	(
		'raw jwk pkcs8 spki pem der hmac sha-1 sha-256 sha-384 sha-512 ' +
		'sign verify encrypt decrypt derivekey derivebits wrapkey unwrapkey ' +
		'aes-gcm aes-cbc aes-ctr rsa-pss rsa-oaep rsassa-pkcs1-v1_5 ecdsa ecdh ' +
		'p-256 p-384 p-521 hkdf'
	).split(' '),
);
const COLLATION = new Set(['base', 'accent', 'case', 'variant']);
const ROLE_WORDS = new Set(
	(
		'admin user guest root access refresh id bearer basic email ' +
		'magic-link session-cookie'
	).split(' '),
);

const ALGORITHM =
	/^(?:sha3-(?:224|256|384|512)|aes-(?:128|192|256)-(?:gcm|cbc|ctr|ecb|ccm|ofb|cfb)|chacha20(?:-poly1305)?|[hrep]s(?:256|384|512))$/i;
const LOCALE = /^[a-z]{2,3}(?:-(?:[A-Z]{2}|[A-Z][a-z]{3}|\d{3}))?$/;
const DURATION = /^\d+\s?(?:ms|s|m|h|d|w|y)$/i;
/** The name of an environment variable, read by the call: `'JWT_SECRET'`. */
const ENV_NAME = /^[A-Z]+(?:_[A-Z]+)+$/;
const TEMPLATE_PART = /\$\{[^}]*\}/g;

export interface LiteralContext {
	/** A backtick literal: `${…}` parts are code. */
	readonly template: boolean;
	/** The value of a credential header: a space is no excuse. */
	readonly inHeader: boolean;
	/** Under a `message`, `error` or `description` key, where a space shows prose. */
	readonly message: boolean;
	/** A key or password position, where short words are secrets: `jwt.sign(p, 'admin')`. */
	readonly keyPosition: boolean;
}

export function isHarmlessLiteral(
	text: string,
	context: LiteralContext,
): boolean {
	if (context.template && text.includes('${')) {
		const fixed = text
			.replace(TEMPLATE_PART, ' ')
			.replace(/\b(?:Bearer|Basic|Token)\b/g, '');
		return /^[^A-Za-z\d]*$/.test(fixed);
	}
	if (/^[^A-Za-z\d]*$/.test(text) || isPlaceholder(`'${text}'`)) return true;
	if (context.inHeader) return false;
	const lower = text.toLowerCase();
	const word =
		!context.keyPosition &&
		(LOCALE.test(text) || ROLE_WORDS.has(lower) || ENV_NAME.test(text));
	return (
		KNOWN_LITERALS.has(lower) ||
		CRYPTO_WORDS.has(lower) ||
		ALGORITHM.test(text) ||
		COLLATION.has(text) ||
		DURATION.test(text) ||
		word ||
		(context.message && !context.keyPosition && /\s/.test(text.trim()))
	);
}
