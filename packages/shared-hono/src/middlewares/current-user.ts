import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { logger } from '@nxgt/shared-logging';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono/types';
import {
	type GatewayTrustOptions,
	requireGatewayTrust,
	trustedPrincipal,
} from './gateway-trust';

export type CurrentUserOptions = GatewayTrustOptions;

/**
 * The caller a gateway resolved, read from the `X-User-*` headers — and ONLY
 * for a request `trustedGateway` vouches for.
 *
 * The client writes those headers. A request without the gateway's proof
 * leaves the context as it was — no `principal`, no `X-User-*` variables —
 * whatever its headers claim, so `secured()` answers it 401. Without a
 * `trustedGateway` this throws when it is called, so a server cannot boot
 * trusting the headers.
 *
 *     currentUser({ trustedGateway: gatewaySecret({ secret: env.GATEWAY_SECRET }) })
 *
 * An API that resolves its own callers — a Kratos session, a Hydra token —
 * uses `oryAuth(ory)` instead.
 */
export const currentUser = (options: CurrentUserOptions): MiddlewareHandler => {
	const trusted = requireGatewayTrust(options, 'currentUser()');
	return createMiddleware(async (ctx, next) => {
		const user = await trustedPrincipal(ctx.req.raw.headers, trusted);
		if (!user) return next();

		logger.info(
			`Resolving principal : name[${user.name}] email[${user.email}] id[${user.id}] client[${user.clientId}]`,
		);
		setUserVariables(ctx, user);
		return next();
	});
};

function setUserVariables(ctx: Context, user: Principal): void {
	ctx.set(USER_HEADERS.ID, user.id);
	ctx.set(USER_HEADERS.USERNAME, user.username);
	ctx.set(USER_HEADERS.EMAIL, user.email);
	ctx.set(USER_HEADERS.NAME, user.name);
	ctx.set(USER_HEADERS.FIRST_NAME, user.firstName);
	ctx.set(USER_HEADERS.LAST_NAME, user.lastName);
	ctx.set(
		USER_HEADERS.BIRTH_DATE,
		user.birthDate ? user.birthDate.toISOString() : null,
	);
	ctx.set(USER_HEADERS.AUTHORITIES, user.authorities);
	ctx.set(USER_HEADERS.CLIENT, user.clientId ?? null);
	ctx.set(USER_HEADERS.ROLES, user.roles ?? []);
	ctx.set(USER_HEADERS.SCOPES, user.scopes ?? []);
	ctx.set('principal', user);
}

export { type Principal, USER_HEADERS };
