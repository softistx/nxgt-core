/**
 * Framework-agnostic claims object passed to every policy evaluator.
 *
 * Mirrors the shape of AccessTokenClaims from the identity service OpenAPI
 * spec but lives here so any package or app can depend on it without pulling
 * in generated codegen output.
 */
export interface PolicyClaims {
	/** Subject — the username (user token) or clientId (client_credentials). */
	sub: string;
	/** Human-readable identifier for the resource owner. */
	username?: string;
	/** Client identifier the token was issued to. */
	clientId: string;
	/** Granted authorities (roles, permissions, scopes as flat strings). */
	authorities?: string[];
	/** Role names assigned to the principal. */
	roles?: string[];
	/** Permission names granted to the principal. */
	permissions?: string[];
	/** Space-separated OAuth scopes. */
	scope?: string;
	/** Allow arbitrary extra claims for custom expression use. */
	[key: string]: unknown;
}
