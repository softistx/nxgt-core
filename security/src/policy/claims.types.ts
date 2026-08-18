/**
 * Framework-agnostic claims object passed to every policy evaluator.
 *
 * Mirrors the shape of AccessTokenClaims from the identity service OpenAPI
 * spec but lives here so any package or app can depend on it without pulling
 * in generated codegen output.
 */
export interface PolicyClaims {
	sub: string;
	username?: string;
	clientId?: string;
	authorities?: string[];
	roles?: string[];
	permissions?: string[];
	scope?: string;
	uid?: string;
	iss?: string;
	exp?: number;
	user?: any;
	[key: string]: unknown;
}
