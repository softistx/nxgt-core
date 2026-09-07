import { claimsFromOryPrincipal } from '@nxgt/security/integrations/ory';
import type { PolicyClaims } from '@nxgt/security/policy';
import type { TokenPrincipal } from '@nxgt/shared';
import { GraphQLError } from 'graphql';
import type { Plugin } from 'graphql-yoga';
import {
	bearerOf,
	type Ory,
	type OryPrincipal,
	OryUnavailable,
} from 'stx-sdk/ory';
import type { GraphQLBaseContext } from '../types';

/**
 * What `useOryAuth()` adds to the context, next to `user` and `token`: the
 * Ory principal itself, or `null` when the request carried no honoured
 * credential. `user.sub === ory.subject` by construction; read `ory` when the
 * value is going to Keto, so the code says what it is.
 */
export type OryContext = {
	ory?: OryPrincipal | null;
	/**
	 * The caller in the vocabulary a rules document reads — what
	 * `applyGraphqlPolicy`'s `getClaims` should return.
	 *
	 * It is NOT `user`. `TokenPrincipal` is the repo-wide principal shape and
	 * carries what a service wants (`uid`, `name`, empty `authorities`); a
	 * rule wants the OIDC claims, `email_verified`, `aal` and `aud` included,
	 * and those have nowhere to live in a `TokenPrincipal`. Reading `user` as
	 * claims is why `expression: "claims.aal === 'aal2'"` guarded a REST route
	 * and silently guarded nothing here.
	 *
	 * Produced by the same `claimsFromOryPrincipal` the REST middleware uses,
	 * so one rule reads the same on both transports.
	 */
	claims?: PolicyClaims;
};

/**
 * The repo-wide TokenPrincipal an Ory principal becomes.
 *
 * `sub` and `uid` are both the Ory subject — a Kratos identity id for a
 * session or a person's token, the client id for a `client_credentials`
 * token — so every service that reads `this.principal?.sub` (or `.uid`) keeps
 * working unchanged. `authorities` is EMPTY on purpose: Keto answers per
 * object, and an empty list is what keeps `@policy` / `useGenericAuth`'s
 * policy extraction from granting anything by accident.
 */
export function toPrincipal(ory: OryPrincipal): TokenPrincipal {
	const email = ory.identity?.email;
	return {
		sub: ory.subject,
		uid: ory.subject,
		name: email ?? ory.clientId ?? ory.subject,
		username: email,
		clientId: ory.clientId,
		scope: ory.scopes.join(' ') || undefined,
		tokenType: ory.kind,
		exp: ory.expiresAt ? Math.floor(ory.expiresAt.getTime() / 1000) : undefined,
		authorities: [],
		roles: [],
	};
}

/**
 * A 503 the client can read as one — a real `GraphQLError` so Yoga's masking
 * leaves it alone, `extensions.http.status` so the transport says 503 too.
 * Never a denial: `stx-sdk/ory` throws `OryUnavailable` only when Kratos,
 * Hydra or Keto could not answer, and that must not read as "not signed in".
 */
export function oryUnavailableError(error: OryUnavailable): GraphQLError {
	return new GraphQLError(`ory: ${error.service} is unavailable`, {
		extensions: {
			code: 'SERVICE_UNAVAILABLE',
			http: { status: 503 },
			debugMessage: error.message,
		},
	});
}

/**
 * The one introspection code path — `Bearer` first, then `X-Session-Token`,
 * then the Kratos cookie; the first credential present decides. Exported so
 * a REST route mounted beside the GraphQL endpoint (content-hub-api's
 * webhook shape) authenticates through the same function instead of a
 * second call.
 */
export async function resolveOryPrincipal(
	ory: Ory,
	headers: Headers,
): Promise<OryContext & { user?: TokenPrincipal; token?: string }> {
	let principal: OryPrincipal | null;
	try {
		principal = await ory.resolve(headers);
	} catch (error) {
		if (error instanceof OryUnavailable) throw oryUnavailableError(error);
		throw error;
	}

	return {
		ory: principal,
		user: principal ? toPrincipal(principal) : undefined,
		claims: principal ? claimsFromOryPrincipal(principal) : undefined,
		token: bearerOf(headers) ?? undefined,
	};
}

/**
 * `useAuth()` for an Ory-native API: resolves the caller through Kratos
 * (session cookie, session token) or Hydra (Bearer, introspected) and puts
 * `user`, `claims`, `token` and `ory` on the context. Wire it exactly where the
 * standalone APIs wire `useAuth()`, ahead of `useGenericAuth` — which then
 * enforces `@authenticated` from `context.user` unchanged.
 *
 * The `Ory` instance comes from the app's `createOry()` — one per process —
 * and is the same one the services use for `isAllowed`.
 */
export function useOryAuth(ory: Ory): Plugin<GraphQLBaseContext & OryContext> {
	return {
		onContextBuilding: async ({ context, extendContext }) => {
			extendContext(await resolveOryPrincipal(ory, context.request.headers));
		},
	};
}
