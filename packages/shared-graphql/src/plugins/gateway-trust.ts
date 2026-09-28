import {
	type GatewayTrust,
	type GatewayTrustOptions,
	requireGatewayTrust as requireTrust,
} from '@nxgt/security/gateway';
import type { TokenPrincipal } from '@nxgt/shared';

// One definition, in `@nxgt/security`, shared with `@nxgt/shared-hono`'s
// `currentUser()` — so a gateway's secret means the same thing to both.
export {
	GATEWAY_SECRET_HEADER,
	type GatewaySecretOptions,
	type GatewayTrust,
	type GatewayTrustOptions,
	gatewaySecret,
	type HeaderReader,
} from '@nxgt/security/gateway';

/**
 * The `trustedGateway` a plugin was given, or a `TypeError` naming the plugin:
 * without one there is no caller it could read, and a plugin that silently
 * reads none is a server whose every caller is anonymous.
 */
export function requireGatewayTrust(
	options: Partial<GatewayTrustOptions> | undefined,
	plugin: string,
): GatewayTrust {
	return requireTrust(options, {
		caller: plugin,
		reads: "the request's extensions",
		alternative: 'useOryAuth(ory)',
	});
}

/**
 * The caller a trusted gateway put in `extensions`, when it is shaped like
 * one: an object with a non-empty string `sub`. Anything else names nobody.
 */
export function principalOf(value: unknown): TokenPrincipal | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const sub = (value as { sub?: unknown }).sub;
	return typeof sub === 'string' && sub.length > 0
		? (value as TokenPrincipal)
		: undefined;
}
