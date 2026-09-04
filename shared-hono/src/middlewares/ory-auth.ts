import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import type { ErrorHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
	bearerOf,
	type Ory,
	type OryPrincipal,
	OryUnavailable,
} from 'stx-sdk/ory';
import { env } from '../env';
import { principalFromMockHeaders } from '../utils/test.utils';

/**
 * Authentication for an Ory-native API — the twin of storex-api's
 * `remoteAuth()`, with the Ory stack instead of oauth-api as the authority.
 * Same contract, so `policyGuard` and a `rules.yaml` keep answering 401 for
 * `authenticated: true` without knowing which authority signed the caller in:
 *
 * - `NODE_ENV=test` and `X-User-*` headers present ⇒ the mock principal, as
 *   every route spec in this repo expects. The Ory principal is synthesised
 *   from it so `<module>.access.ts` sees a `subject` either way.
 * - no credential, or one Kratos / Hydra does not honour ⇒ `next()` as an
 *   anonymous caller. The rules file decides whether that is a 401.
 * - Kratos, Hydra or Keto unreachable ⇒ **503**, fail closed. Never an
 *   anonymous `next()`: that turns an outage into a lockout with no error.
 * - otherwise `principal` (the repo-wide shape), `ory` (the Ory one —
 *   `subject` is what Keto receives), `accessToken` (the Bearer, if that is
 *   what came in) and `X-Claims`.
 *
 * Takes an `Ory` rather than URLs so the app builds one `createOry()` from
 * its own zod-validated env and shares it with its access layer.
 */
export function oryAuth(ory: Ory) {
	return createMiddleware(async (ctx, next) => {
		if (env.NODE_ENV === 'test') {
			const mockPrincipal = principalFromMockHeaders(ctx);
			if (mockPrincipal) {
				ctx.set('principal', mockPrincipal);
				ctx.set('ory', oryPrincipalFromMock(mockPrincipal));
				ctx.set(USER_HEADERS.CLAIMS, {
					sub: mockPrincipal.id,
					username: mockPrincipal.username ?? undefined,
					clientId: mockPrincipal.clientId ?? undefined,
					authorities: mockPrincipal.authorities ?? [],
					roles: mockPrincipal.roles ?? [],
					scope: mockPrincipal.scopes?.join(' '),
				});
				return next();
			}
		}

		let resolved: OryPrincipal | null;
		try {
			resolved = await ory.resolve(ctx.req.raw.headers);
		} catch (error) {
			if (!(error instanceof OryUnavailable)) throw error;
			throw serviceUnavailable(error);
		}

		if (!resolved) {
			ctx.set('ory', null);
			return next();
		}

		const principal = toPrincipal(resolved);
		logger.info(
			`Resolving principal (ory ${resolved.kind}): subject[${resolved.subject}]`,
		);

		ctx.set('principal', principal);
		ctx.set('ory', resolved);
		ctx.set('accessToken', bearerOf(ctx.req.raw.headers));
		ctx.set(USER_HEADERS.CLAIMS, {
			sub: resolved.subject,
			kind: resolved.kind,
			email: resolved.identity?.email,
			email_verified: resolved.identity?.verified,
			clientId: resolved.clientId,
			scope: resolved.scopes.join(' ') || undefined,
			aud: resolved.audience,
			aal: resolved.aal,
			exp: resolved.expiresAt?.toISOString(),
		});

		return next();
	});
}

/**
 * The 503 an `OryUnavailable` becomes — for the middleware above and for
 * `withOryUnavailable` below, so a Keto outage in a service's `isAllowed`
 * answers the same thing as a Kratos outage in `resolve`.
 */
export function serviceUnavailable(error: OryUnavailable): CustomException {
	logger.error(
		`Ory ${error.service} unavailable (${error.status}): ${JSON.stringify(error.body)}`,
	);
	return CustomException.from({
		message: 'errors.service-unavailable',
		code: 503,
		debugMessage: `ory: ${error.message}`,
	});
}

/**
 * Wraps the app's error handler so an `OryUnavailable` thrown anywhere
 * below the middleware — an access layer asking Keto, a service listing
 * tuples — is a 503 and not the generic 500. Without it the middleware's
 * own mapping only covers `resolve`, and a Keto restart would surface as
 * "Internal server error" from every guarded route:
 *
 * ```ts
 * app.onError(withOryUnavailable(createErrorHandler(translate)));
 * ```
 */
export function withOryUnavailable(handler: ErrorHandler): ErrorHandler {
	return (error, ctx) =>
		handler(
			error instanceof OryUnavailable ? serviceUnavailable(error) : error,
			ctx,
		);
}

/**
 * The repo-wide `Principal` from an Ory one. `id` is the subject — the
 * identity id or the client id — because `id` is what every existing
 * `ownerId` comparison reads, and a tuple written for `subject` must match
 * an ownership check written for `id`. No authorities and no roles: Keto
 * answers those questions per object, and an empty list is what stops a
 * `@policy`-style check from granting anything by accident.
 */
export function toPrincipal(ory: OryPrincipal): Principal {
	const principal: Principal = {
		id: ory.subject,
		username: ory.identity?.email ?? null,
		email: ory.identity?.email ?? null,
		firstName: ory.identity?.name?.first ?? null,
		lastName: ory.identity?.name?.last ?? null,
		birthDate: null,
		authorities: [],
		roles: [],
		clientId: ory.clientId ?? null,
		scopes: ory.scopes,
	};
	principal.name = principal.username || principal.clientId || undefined;
	return principal;
}

/** What a route spec's `mockUser()` looks like once it has been through Ory. */
function oryPrincipalFromMock(mock: Principal): OryPrincipal {
	return {
		subject: mock.id ?? mock.clientId ?? 'mock',
		kind: mock.clientId && !mock.id ? 'token' : 'session',
		identity: mock.email
			? {
					email: mock.email,
					name: {
						first: mock.firstName ?? undefined,
						last: mock.lastName ?? undefined,
					},
					verified: true,
				}
			: undefined,
		scopes: mock.scopes ?? [],
		clientId: mock.clientId ?? undefined,
	};
}
