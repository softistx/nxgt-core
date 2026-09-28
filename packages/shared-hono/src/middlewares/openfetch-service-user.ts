import type { GatewaySecretOptions } from '@nxgt/security/gateway';
import { USER_HEADERS } from '@nxgt/shared/models';
import { tryGetContext } from 'hono/context-storage';
import type { Middleware } from 'openapi-fetch';
import { gatewayProof } from '../utils/gateway-proof';

/**
 * Forwards the current request's caller to a REST service as the `X-User-*`
 * headers a gateway sends. That service's `currentUser()` reads them only
 * with the gateway's proof, so pass the secret its `gatewaySecret()` holds:
 *
 *     client.use(openfetchServiceUser({ secret: env.GATEWAY_SECRET }));
 *
 * Without it the headers still go out, and the service ignores them.
 */
export function openfetchServiceUser(
	gateway?: GatewaySecretOptions,
): Middleware {
	const proof = gatewayProof(gateway, 'openfetchServiceUser()');
	const ctx = tryGetContext();
	return {
		async onRequest({ request }) {
			if (ctx?.get(USER_HEADERS.ID)) {
				if (proof) request.headers.set(proof.header, proof.secret);
				request.headers.set(USER_HEADERS.ID, ctx.get(USER_HEADERS.ID) || '');
				request.headers.set(
					USER_HEADERS.USERNAME,
					ctx.get(USER_HEADERS.USERNAME) || '',
				);
				request.headers.set(
					USER_HEADERS.EMAIL,
					ctx.get(USER_HEADERS.EMAIL) || '',
				);
				request.headers.set(
					USER_HEADERS.FIRST_NAME,
					ctx.get(USER_HEADERS.FIRST_NAME) || '',
				);
				request.headers.set(
					USER_HEADERS.LAST_NAME,
					ctx.get(USER_HEADERS.LAST_NAME) || '',
				);
				request.headers.set(
					USER_HEADERS.BIRTH_DATE,
					ctx.get(USER_HEADERS.BIRTH_DATE) || '',
				);
				request.headers.set(
					USER_HEADERS.AUTHORITIES,
					ctx.get(USER_HEADERS.AUTHORITIES)?.join(',') || '',
				);
				request.headers.set(
					USER_HEADERS.CLIENT,
					ctx.get(USER_HEADERS.CLIENT) || '',
				);
				request.headers.set(
					USER_HEADERS.ROLES,
					ctx.get(USER_HEADERS.ROLES)?.join(',') || '',
				);
				request.headers.set(
					USER_HEADERS.SCOPES,
					ctx.get(USER_HEADERS.SCOPES)?.join(',') || '',
				);
				request.headers.set('X-Service', 'gateway');
			}
			return request;
		},
	};
}
