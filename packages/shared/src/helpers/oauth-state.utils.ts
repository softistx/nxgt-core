// ---------------------------------------------------------------------------
// OAuth state utilities
// Generates and verifies OAuth state parameters for CSRF protection.
// Uses the Web Crypto API (crypto.subtle) — no external dependencies.
// ---------------------------------------------------------------------------

import { base64urlEncode } from './pkce.utils';

/**
 * Generate a cryptographically random OAuth state parameter.
 *
 * The state is a base64url-encoded random string of 32 bytes (43 chars),
 * used to prevent CSRF attacks in OAuth authorization flows.
 *
 * @returns Base64url-encoded state string (43 chars)
 */
export function generateOAuthState(byteLength = 32): string {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	return base64urlEncode(bytes);
}

/**
 * Verify an OAuth state parameter against the expected value.
 *
 * @param expectedState  The state sent in the authorization request
 * @param receivedState  The state received in the redirect/callback
 * @returns              `true` if the states match
 */
export function verifyOAuthState(
	expectedState: string,
	receivedState: string,
): boolean {
	return expectedState === receivedState;
}
