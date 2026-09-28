import {
	type GatewayTrust,
	type GatewayTrustOptions,
	type HeaderReader,
	requireGatewayTrust as requireTrust,
} from '@nxgt/security/gateway';
import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { logger } from '@nxgt/shared-logging';

// One definition, in `@nxgt/security`, shared with `@nxgt/shared-graphql`'s
// `useAuth()` — so a gateway's secret means the same thing to both.
export {
	GATEWAY_SECRET_HEADER,
	type GatewaySecretOptions,
	type GatewayTrust,
	type GatewayTrustOptions,
	gatewaySecret,
	type HeaderReader,
} from '@nxgt/security/gateway';

/**
 * The `trustedGateway` a middleware was given, or a `TypeError` naming it:
 * without one there is no caller it could read, and a middleware that
 * silently reads none is a server whose every caller is anonymous.
 */
export function requireGatewayTrust(
	options: Partial<GatewayTrustOptions> | undefined,
	caller: string,
	call?: string,
): GatewayTrust {
	return requireTrust(options, {
		caller,
		reads: 'the X-User-* headers',
		alternative: 'oryAuth(ory)',
		call,
	});
}

/**
 * The caller the `X-User-*` headers name, ONLY for a request `trusted`
 * vouches for. Headers that name nobody (no `X-User-Id`, no `X-Client-Id`)
 * and headers from anyone else are both `undefined`: the client writes them,
 * so on their own they prove nothing.
 */
export async function trustedPrincipal(
	headers: HeaderReader,
	trusted: GatewayTrust,
): Promise<Principal | undefined> {
	const principal = principalFromUserHeaders(headers);
	if (!principal) return undefined;
	if (!(await trusted(headers))) {
		logger.warn(
			'X-User-* headers ignored: the request does not come from the trusted gateway',
		);
		return undefined;
	}
	return principal;
}

/**
 * The trust `oryAuth` reads mock headers with: its `trustedGateway`, and only
 * under `NODE_ENV=test`. Anywhere else, none — whatever the option says.
 */
export function mockHeadersTrust(
	nodeEnv: string,
	trustedGateway: GatewayTrust | undefined,
): GatewayTrust | undefined {
	return nodeEnv === 'test' ? trustedGateway : undefined;
}

/** The `Principal` the headers describe, trusted or not. Never exported. */
function principalFromUserHeaders(
	headers: HeaderReader,
): Principal | undefined {
	const read = (name: string) => headers.get(name) ?? undefined;
	const list = (name: string) => read(name)?.split(',') || [];
	const id = read(USER_HEADERS.ID);
	const clientId = read(USER_HEADERS.CLIENT);
	if (!id && !clientId) return undefined;

	const birthDate = read(USER_HEADERS.BIRTH_DATE);
	const principal: Principal = {
		id,
		username: read(USER_HEADERS.USERNAME),
		email: read(USER_HEADERS.EMAIL),
		firstName: read(USER_HEADERS.FIRST_NAME),
		lastName: read(USER_HEADERS.LAST_NAME),
		birthDate: birthDate ? new Date(birthDate) : null,
		authorities: list(USER_HEADERS.AUTHORITIES),
		clientId: clientId || null,
		roles: list(USER_HEADERS.ROLES),
		scopes: list(USER_HEADERS.SCOPES),
	};
	principal.name = principal.username || principal.clientId || undefined;
	return principal;
}
