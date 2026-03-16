// ---------------------------------------------------------------------------
// PKCE (RFC 7636) utilities
// Uses the Web Crypto API (crypto.subtle) — no external dependencies.
// ---------------------------------------------------------------------------

/** Supported PKCE challenge methods */
export const PKCE_METHODS = ['S256', 'plain'] as const;
export type PkceMethod = (typeof PKCE_METHODS)[number];

/**
 * Encode a Uint8Array as a base64url string (no padding, url-safe chars).
 */
function base64urlEncode(bytes: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate a cryptographically random PKCE code verifier.
 *
 * The verifier is a base64url-encoded random string of the requested byte
 * length (defaults to 32 bytes → 43 base64url chars, the RFC 7636 minimum).
 *
 * @param byteLength  Number of random bytes to generate (32–96, defaults to 32)
 * @returns           Base64url-encoded verifier string (43–128 chars)
 */
export function generateCodeVerifier(byteLength = 32): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return base64urlEncode(bytes);
}

/**
 * Derive a PKCE code challenge from a code verifier.
 *
 * - `S256`  →  BASE64URL(SHA256(ASCII(codeVerifier)))   (recommended)
 * - `plain` →  codeVerifier (unchanged)
 *
 * @param codeVerifier  The raw verifier produced by {@link generateCodeVerifier}
 * @param method        Challenge method: 'S256' (default) or 'plain'
 * @returns             The code challenge to send to the authorization endpoint
 */
export async function generateCodeChallenge(
	codeVerifier: string,
	method: PkceMethod = 'S256',
): Promise<string> {
	if (method === 'plain') {
		return codeVerifier;
	}
	const encoded = new TextEncoder().encode(codeVerifier);
	const digest = await crypto.subtle.digest('SHA-256', encoded);
	return base64urlEncode(new Uint8Array(digest));
}

/**
 * Verify a PKCE code_verifier against a stored code_challenge.
 *
 * @param method         The challenge method used at authorization time: 'S256' or 'plain'
 * @param codeVerifier   The raw verifier sent by the client at the token endpoint
 * @param codeChallenge  The challenge stored when /authorize was called
 * @returns              `true` if the verifier is valid
 */
export async function verifyPkce(
	method: PkceMethod,
	codeVerifier: string,
	codeChallenge: string,
): Promise<boolean> {
	const computed = await generateCodeChallenge(codeVerifier, method);
	return computed === codeChallenge;
}
