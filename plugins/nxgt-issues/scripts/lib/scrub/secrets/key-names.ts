/**
 * Whether a `key` name's value is a secret. A plain `key` name (`key`,
 * `sortKey`, `i18nKey`) names many things that are not secrets, so its value
 * refuses only when it looks like key material. A name that says what the key
 * is for (`signingKey`, `accessKeyId`, `licenseKey`, `clientKey`) and an
 * environment-style name ending in `KEY` (`STRIPE_KEY`, `S3_ACCESS_KEY`)
 * refuse any value the code-value rules do not let through.
 */

import { wordsOf } from './code-values';

const STRONG_KEY = new Set(
	(
		'signing hmac master encryption encrypt cipher crypto aes jwt secret ' +
		'access client license private'
	).split(' '),
);

/**
 * Key material: eight or more letters, digits, `+/=_-`, with letters and
 * digits switching at least twice across its dash segments (`Zq8w-LmP3`),
 * case switching at least six times (`AbCdEfGh`), or a licence-key shape
 * (`ABCD-EFGH-IJKL-MNOP`). Never `tenant1234`, `theme-v2` or `createdAt`.
 */
export function isKeyMaterial(text: string): boolean {
	if (!/^[A-Za-z\d+/=_-]{8,}$/.test(text)) return false;
	const digitSwitches = text
		.split('-')
		.reduce(
			(sum, part) =>
				sum + (part.match(/[A-Za-z](?=\d)|\d(?=[A-Za-z])/g)?.length ?? 0),
			0,
		);
	const caseSwitches =
		text.match(/[a-z](?=[A-Z])|[A-Z](?=[a-z])/g)?.length ?? 0;
	const licence = /^(?:[A-Za-z\d]{4,}-){2,}[A-Za-z\d]{4,}$/.test(text);
	return digitSwitches >= 2 || caseSwitches >= 6 || licence;
}

/** True when a `key`-keyword assignment's value is a name, not a secret. */
export function isNamingKey(name: string, value: string): boolean {
	const words = wordsOf(name);
	if (words.some((word) => STRONG_KEY.has(word))) return false;
	if (name === name.toUpperCase() && words.at(-1) === 'key') return false;
	return !isKeyMaterial(value.replace(/^["'`]|["'`,]+$/g, ''));
}
