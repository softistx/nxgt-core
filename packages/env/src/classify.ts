import type { Charset, Generator, Source } from './types';

/**
 * A credential that something else issues. Never generated, whatever the name
 * suffix says: inventing one produces a value that is syntactically fine and
 * authenticates against nothing.
 *
 * `*_CLIENT_SECRET` is the case that makes this list necessary. It ends in
 * `_SECRET`, so the generate rule below would claim it — but an OAuth client
 * secret is what the authorization server answers with when the client is
 * registered. Generating it writes a `.env` that fails at the token exchange,
 * which is a long way from where the mistake was made.
 */
const MANUAL: [RegExp, string][] = [
	[
		/_CLIENT_SECRET$/,
		'an OAuth server issues it when the client is registered',
	],
	[/_CLIENT_ID$/, 'an OAuth server issues it, or it is chosen and shared'],
	[/(^|_)API_KEY$/, 'a provider issues it'],
	[/_TOKEN$/, 'a provider or a registry issues it'],
	[/_ACCESS_KEY(_ID)?$/, 'the object store issues it'],
	[
		/_PRIVATE_KEY$/,
		'a key pair is generated with its own tool, not as a string',
	],
	[/_CERT(IFICATE)?$/, 'a certificate authority issues it'],
	[/_DSN$/, 'a DSN is composed from other values, not generated'],
	[/_LICENSE(_KEY)?$/, 'a vendor issues it'],
];

/**
 * A value only this deployment defines, so there is nothing to look up and
 * nothing to agree with: generating it is strictly better than a placeholder a
 * human copies from another machine.
 */
const GENERATE: [RegExp, Generator][] = [
	[/_SECRET$/, 'secret'],
	[/^SECRET_/, 'secret'],
	[/_PASSWORD$/, 'password'],
	[/_PASS$/, 'password'],
	[/_PASSPHRASE$/, 'password'],
	[/_SALT$/, 'hex'],
	[/_ENCRYPTION_KEY$/, 'base64'],
	[/_SIGNING_KEY$/, 'base64'],
];

export const DEFAULT_LENGTH: Record<Generator, number> = {
	// 64 characters of base64url, which covers every `min(32)` this parc checks
	// for and is still one line.
	secret: 64,
	password: 24,
	hex: 32,
	base64: 32,
	uuid: 36,
};

/**
 * Reads an `# @env …` annotation out of the comment lines above a key.
 *
 * ```
 * # @env secret length=64
 * # @env password length=24 charset=alnum
 * # @env manual — the tunnel's dashboard shows it
 * # @env copy
 * ```
 *
 * The annotation always wins over the name. That is the whole point of it: the
 * name rules below are a good default and a bad law.
 */
export function readAnnotation(comments: string[]): Source | null {
	for (const comment of comments) {
		const match = /@env\s+(\w+)(.*)$/.exec(comment);
		if (!match) continue;
		const kind = match[1] as string;
		const rest = match[2] ?? '';
		if (kind === 'manual') {
			const reason = rest.replace(/^[\s—:-]+/, '').trim();
			return { kind: 'manual', reason: reason || 'annotated `@env manual`' };
		}
		if (kind === 'copy') return { kind: 'copy' };
		if (!(kind in DEFAULT_LENGTH)) continue;
		const generator = kind as Generator;
		const length = Number(
			/length=(\d+)/.exec(rest)?.[1] ?? DEFAULT_LENGTH[generator],
		);
		const charset = (/charset=(\w+)/.exec(rest)?.[1] ?? 'safe') as Charset;
		return { kind: 'generate', generator, length, charset };
	}
	return null;
}

/** The name rules, applied in order: manual first, because it is the narrower set. */
export function classifyByName(key: string): Source {
	for (const [pattern, reason] of MANUAL) {
		if (pattern.test(key)) return { kind: 'manual', reason };
	}
	for (const [pattern, generator] of GENERATE) {
		if (pattern.test(key)) {
			return {
				kind: 'generate',
				generator,
				length: DEFAULT_LENGTH[generator],
				charset: 'safe',
			};
		}
	}
	return { kind: 'copy' };
}
