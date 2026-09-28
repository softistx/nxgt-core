import type { ApolloServerPlugin } from '@apollo/server';
import type { TokenPrincipal } from '@nxgt/shared';
import {
	type GatewayTrustOptions,
	principalOf,
	requireGatewayTrust,
} from './gateway-trust';

export type ExtractJwtOptions = GatewayTrustOptions;

/** What `extractJwtPlugin()` sets on an Apollo context. */
export type JwtContext = {
	jwt?: { payload: TokenPrincipal };
};

/**
 * Apollo Server's counterpart of `useAuth()`: the JWT payload a gateway
 * verified and forwarded in `request.extensions.payload`, copied onto
 * `context.jwt` — ONLY for a request `trustedGateway` vouches for.
 *
 * A request without the gateway's proof leaves `context.jwt` as the context
 * function built it, whatever its `extensions` claim.
 *
 *     plugins: [extractJwtPlugin({ trustedGateway: gatewaySecret({ secret }) })]
 */
export function extractJwtPlugin(
	options: ExtractJwtOptions,
): ApolloServerPlugin<JwtContext> {
	const trusted = requireGatewayTrust(options, 'extractJwtPlugin()');
	return {
		async requestDidStart({ request, contextValue }) {
			const headers = request.http?.headers;
			if (!headers || !(await trusted(headers))) return;
			const payload = principalOf(request.extensions?.payload);
			if (payload) contextValue.jwt = { payload };
		},
	};
}
