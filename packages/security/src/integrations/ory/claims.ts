import type { OryPrincipal } from 'stx-sdk/ory';
import type { PolicyClaims } from '../../policy';

/**
 * The one mapper from a resolved Ory caller to the claims a rule sees.
 *
 * It exists because there were two, and they had drifted. `oryAuth()` in
 * `@nxgt/shared-hono` wrote `exp` as an **ISO string** into a field declared
 * `number`, and `toPrincipal` in `@nxgt/shared-graphql` wrote it as seconds
 * but dropped `email_verified`, `aal` and `aud` altogether. The same caller
 * therefore reached the same rule as two different objects depending on the
 * transport — so `expression: "claims.aal === 'aal2'"` guarded a REST route
 * and silently guarded nothing on a GraphQL field.
 *
 * Both middlewares now call this, for the same reason the rules file, the
 * `@check` directive and `ketoCheck()` all call `evaluateRequirement`: one
 * implementation is the only thing that keeps two vocabularies honest.
 *
 * Like `integrations/hono/keto`, this module imports `stx-sdk` and is its own
 * entrypoint for that reason — a service that resolves its callers some other
 * way never loads it, and never has to install the optional peer.
 *
 * @example
 * ```ts
 * ctx.set(USER_HEADERS.CLAIMS, claimsFromOryPrincipal(resolved));
 * ```
 */
export function claimsFromOryPrincipal(principal: OryPrincipal): PolicyClaims {
	const claims: PolicyClaims = { sub: principal.subject, kind: principal.kind };

	const { identity } = principal;
	if (identity?.email) {
		claims.email = identity.email;
		claims.email_verified = identity.verified;
	}

	if (principal.aal) claims.aal = principal.aal;
	if (principal.clientId) claims.clientId = principal.clientId;
	if (principal.audience?.length) claims.aud = principal.audience;

	// Empty rather than `''`: `checkAuthorities` splits this string, and an
	// empty one would contribute nothing anyway — but an absent claim is the
	// honest statement that this caller has no scopes, and it is what the edge
	// token carries.
	const scope = principal.scopes.join(' ');
	if (scope) claims.scope = scope;

	// A NumericDate — seconds, per RFC 7519 §2. The ISO string the REST
	// middleware used to write was not just a different spelling: it made
	// `claims.exp < Date.now() / 1000` compare a string to a number, which is
	// false for every value and so never refused anything.
	if (principal.expiresAt) {
		claims.exp = Math.floor(principal.expiresAt.getTime() / 1000);
	}

	// Deliberately absent: `authorities`, `roles`, `permissions`. An Ory
	// caller has none — Keto answers per object, and an empty list here is
	// what stops an `authorities:` group being satisfied by accident. The Ory
	// way to say "may do this" is a `keto:` term.
	return claims;
}
