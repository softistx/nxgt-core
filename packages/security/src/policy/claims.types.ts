/**
 * Framework-agnostic claims object passed to every policy evaluator — the
 * only thing a rule ever sees about the caller.
 *
 * The vocabulary is **Kratos/OIDC first**. That is not cosmetic: the parc's
 * identity core is Ory (Kratos for people, Hydra for clients, Keto for what
 * they may do), and `sub`, `email`, `email_verified`, `aal`, `aud`, `scope`,
 * `iss` and `exp` are all registered or Ory-defined names with settled
 * meanings. A rule written against them reads the same on every transport and
 * survives the identity core it was written for.
 *
 * A guard never reads this off the wire. `policyGuard` takes it from a Hono
 * context variable that only an earlier middleware sets, which is what stops a
 * client forging one — see the note in the package README.
 *
 * Producers must not hand-roll it. `claimsFromOryPrincipal` in
 * `@nxgt/security/integrations/ory` is the one mapper, shared by the REST and
 * GraphQL Ory middlewares, because two hand-written producers had already
 * drifted: one wrote `exp` as an ISO string under a field declared `number`,
 * the other dropped `email_verified`, `aal` and `aud` entirely, so the same
 * caller reached the same rule as two different objects.
 */
export interface PolicyClaims {
	/**
	 * The caller. A Kratos identity id for a session, Hydra's `sub` for a
	 * token (the client id for `client_credentials`), a user id for a legacy
	 * oauth-api token.
	 *
	 * This is also the string Keto receives as the subject of a permission
	 * check, which is why a `keto:` term needs nothing else configured.
	 */
	sub: string;

	// -----------------------------------------------------------------------
	// Ory / OIDC — what an Ory-native caller carries
	// -----------------------------------------------------------------------

	/**
	 * How the caller authenticated: a Kratos browser session, or a token
	 * (Hydra, or an edge JWT standing in for one).
	 */
	kind?: 'session' | 'token';

	/** Kratos identity trait. Absent for a `client_credentials` caller. */
	email?: string;

	/**
	 * Whether Kratos has verified that address. Snake_case because it is the
	 * OIDC claim name, and the same string the edge token carries — renaming
	 * it here would mean translating at every boundary.
	 */
	email_verified?: boolean;

	/**
	 * Authenticator Assurance Level — `'aal1'` for a password, `'aal2'` once a
	 * second factor was used. The claim to reach for when a route should
	 * demand step-up: `expression: "claims.aal === 'aal2'"`.
	 *
	 * Sessions only. A token has none, and a rule that requires one is
	 * therefore also a rule that excludes machine callers — usually what is
	 * meant, but say so on purpose.
	 */
	aal?: string;

	/** Token audience, when the issuer stamped one. */
	aud?: string[];

	/** The confidential client, when one authenticated. */
	clientId?: string;

	/**
	 * Space-separated OAuth scopes. `checkAuthorities` splits this and treats
	 * each token as an authority, which for an Ory caller is the ONLY way an
	 * `authorities:` group can be satisfied — see the note there.
	 */
	scope?: string;

	/** Token issuer. */
	iss?: string;

	/**
	 * Expiry as a NumericDate: **seconds** since the epoch, per RFC 7519 §2.
	 * Not milliseconds and not an ISO string, so `claims.exp < Date.now() /
	 * 1000` is the comparison that works.
	 */
	exp?: number;

	// -----------------------------------------------------------------------
	// oauth-api — the deprecated vocabulary
	// -----------------------------------------------------------------------
	// `apps/oauth` is being retired in favour of Kratos/Hydra/Keto. These stay
	// because three rules documents in production still name them through
	// `authorities:`, and because storex-api and the gateway still resolve
	// their callers by introspecting oauth-api. They are not the shape to
	// write new rules against.

	/**
	 * @deprecated oauth-api vocabulary. An Ory caller has no username; use
	 * `email` for a person or `clientId` for a machine.
	 */
	username?: string;

	/**
	 * Coarse authority strings, checked by `checkAuthorities`.
	 *
	 * @deprecated oauth-api vocabulary. An Ory caller's authorities are
	 * **empty by construction** — Keto answers per object, so the Ory
	 * equivalent of an authority group is a `keto:` term, not a longer list
	 * here.
	 */
	authorities?: string[];

	/** @deprecated oauth-api vocabulary. Unioned with `authorities`. */
	roles?: string[];

	/** @deprecated oauth-api vocabulary. Read by nothing in the parc. */
	permissions?: string[];

	/** @deprecated oauth-api vocabulary. A duplicate of `sub`. */
	uid?: string;

	/**
	 * The full user profile some oauth-api tokens carry.
	 *
	 * @deprecated oauth-api vocabulary. `unknown`, not `any`: it used to
	 * disable type checking on everything reached through it, and nothing in
	 * the parc reads it.
	 */
	user?: unknown;

	/**
	 * Anything else the issuer sent. An expression can read it; nothing here
	 * promises it is there.
	 */
	[key: string]: unknown;
}
