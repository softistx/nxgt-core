import type { Plugin } from 'graphql-yoga';
import type { GraphQLBaseContext } from '../types';
import {
	type GatewayTrustOptions,
	principalOf,
	requireGatewayTrust,
} from './gateway-trust';

export type UseAuthOptions = GatewayTrustOptions;

/**
 * The caller a gateway resolved, read from the GraphQL request's `extensions`
 * — `user` and `token` — and ONLY for a request `trustedGateway` vouches for.
 *
 * `extensions` sits in the request body, which any client writes. A request
 * without the gateway's proof leaves the context as it was: no `user`, no
 * `token`, whatever its `extensions` claim. Without a `trustedGateway` this
 * throws when it is called, so a server cannot boot trusting the body.
 *
 *     useAuth({ trustedGateway: gatewaySecret({ secret: env.GATEWAY_SECRET }) })
 *
 * An API that resolves its own callers — a Kratos session, a Hydra token —
 * uses `useOryAuth(ory)` instead.
 */
export function useAuth(options: UseAuthOptions): Plugin<GraphQLBaseContext> {
	const trusted = requireGatewayTrust(options, 'useAuth()');
	return {
		onContextBuilding: async ({ context, extendContext }) => {
			// Only a fetch Request can carry the proof. A WebSocket context holds
			// none, or a Node upgrade request whose headers are a plain record:
			// neither names a caller here — `resolveWsUser` does, per connection.
			const headers = context.request?.headers;
			if (typeof headers?.get !== 'function') return;
			if (!(await trusted(headers))) return;
			const user = principalOf(context.params?.extensions?.user);
			if (!user) return;
			const token = context.params.extensions?.token;
			extendContext({
				user,
				token: typeof token === 'string' ? token : undefined,
			});
		},
	};
}
