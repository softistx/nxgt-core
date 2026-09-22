import type { Charset, Generator } from './types';

/**
 * Deliberately narrow alphabets.
 *
 * `safe` excludes every character that changes meaning somewhere a credential
 * travels: `$` (shell and compose interpolation), space, `'`, `"`, `` ` ``,
 * `\`, `#` (a dotenv comment), `=` (the separator itself) and `:` (a DSN's
 * separator). This is not theoretical tidiness — on the machine this package
 * was written for, `export S3_PASSWORD=…$…` silently exported ten characters of
 * a twenty-character password, and a `MONGO_PASSWORD` with a space in it was cut
 * at the space while bash ran the remainder as a command at every shell start.
 * Both values were then baked into running containers.
 *
 * The entropy lost by dropping punctuation is bought back with length: 64
 * characters of this alphabet is ~380 bits.
 */
const ALPHABETS: Record<Charset, string> = {
	safe: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~',
	alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
	hex: '0123456789abcdef',
};

/**
 * Rejection sampling, not `% alphabet.length`: the modulo is biased whenever
 * 256 is not a multiple of the alphabet size, which it never is here.
 */
function randomString(length: number, alphabet: string): string {
	const out: string[] = [];
	const limit = Math.floor(256 / alphabet.length) * alphabet.length;
	const buffer = new Uint8Array(Math.ceil(length * 1.3) + 16);
	while (out.length < length) {
		crypto.getRandomValues(buffer);
		for (const byte of buffer) {
			if (byte >= limit) continue;
			out.push(alphabet[byte % alphabet.length] as string);
			if (out.length === length) break;
		}
	}
	return out.join('');
}

export function generateValue(
	generator: Generator,
	length: number,
	charset: Charset = 'safe',
): string {
	switch (generator) {
		case 'uuid':
			return crypto.randomUUID();
		case 'hex':
			return randomString(length, ALPHABETS.hex);
		case 'base64': {
			const bytes = new Uint8Array(length);
			crypto.getRandomValues(bytes);
			return btoa(String.fromCharCode(...bytes));
		}
		case 'password':
			return randomString(length, ALPHABETS[charset]);
		default:
			return randomString(
				length,
				ALPHABETS[charset === 'hex' ? 'hex' : 'safe'],
			);
	}
}

/** True when a value would survive a shell, a dotenv parser and compose unquoted. */
export function isTransportSafe(value: string): boolean {
	return !/[\s$'"`\\#=:]/.test(value);
}
