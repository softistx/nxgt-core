import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { mongoose } from '@nxgt/shared-mongo';
import type { Context } from 'hono';
import type { Middleware } from 'openapi-fetch';
import {
	type GatewaySecretOptions,
	type GatewayTrustOptions,
	requireGatewayTrust,
	trustedPrincipal,
} from '../middlewares/gateway-trust';
import { gatewayProof } from './gateway-proof';

/**
 * Inverse of `mockAuthMiddleware`: reads the `X-User-*` headers it injects
 * back into a `Principal` — ONLY for a request `trustedGateway` vouches for.
 * For services that verify tokens themselves but still want their route
 * specs, written against `mockAuthMiddleware`, to work unchanged. Resolves
 * `undefined` when no such headers are present or the request is not
 * trusted, so callers can fall back to real token verification. Throws a
 * `TypeError` without a `trustedGateway`: the client writes these headers.
 */
export async function principalFromMockHeaders(
	ctx: Context,
	options: GatewayTrustOptions,
): Promise<Principal | undefined> {
	const trusted = requireGatewayTrust(
		options,
		'principalFromMockHeaders()',
		'principalFromMockHeaders(ctx, { trustedGateway: gatewaySecret({ secret }) })',
	);
	return trustedPrincipal(ctx.req.raw.headers, trusted);
}

export function mockUser(
	values: Omit<Principal, 'authorities' | 'id'> & {
		permissions?: string[];
		roles?: string[];
	},
): Principal {
	return {
		id: new mongoose.mongo.ObjectId().toHexString(),
		authorities: [...(values.roles ?? []), ...(values.permissions ?? [])],
		name: values.username || undefined,
		...values,
	};
}

/**
 * Sends `user` as the `X-User-*` headers a gateway would. Pass the secret
 * the app's `gatewaySecret()` holds, so `currentUser()` and `oryAuth()`
 * trust them; without it they are ignored, as a forged header is.
 */
export function mockAuthMiddleware(
	user: Principal,
	gateway?: GatewaySecretOptions,
): Middleware {
	const proof = gatewayProof(gateway, 'mockAuthMiddleware()');
	return {
		async onRequest({ request }) {
			if (proof) request.headers.set(proof.header, proof.secret);
			request.headers.set(USER_HEADERS.ID, user.id || '');
			request.headers.set(USER_HEADERS.USERNAME, user.username || '');
			request.headers.set(USER_HEADERS.EMAIL, user.email || '');
			request.headers.set(
				USER_HEADERS.AUTHORITIES,
				user.authorities?.join(',') || '',
			);
			request.headers.set(
				USER_HEADERS.BIRTH_DATE,
				user.birthDate?.toISOString() ?? '',
			);
			request.headers.set(USER_HEADERS.FIRST_NAME, user.firstName ?? '');
			request.headers.set(USER_HEADERS.LAST_NAME, user.lastName ?? '');
			return request;
		},
	};
}

/**
 * openapi-fetch middleware that turns a `POST <resource>/search` call into the
 * `QUERY <resource>` it mirrors — same body, same response, safe method.
 *
 * The generated client cannot express QUERY: `openapi-typescript` has no
 * `query` path-item key (its method list is the eight classic verbs), so the
 * operation is invisible to the `paths` type, and `openapi-fetch`'s own
 * `request()` is constrained to `HttpMethod`. Call the POST search operation
 * for the types — request and response are identical either way — and let this
 * rewrite the verb *and* drop the `/search` suffix on the wire:
 *
 * ```ts
 * client.use(mockAuthMiddleware(principal));
 * const { data, error } = await client.POST('/tags/search', {
 *   body: {},
 *   middleware: [asQueryMethod],
 * });   // actually sends: QUERY /tags
 * ```
 *
 * Per-request middleware runs after the ones registered with `client.use()`,
 * so headers set by `mockAuthMiddleware` are already on the request and are
 * carried over. The body is read to a string rather than passed as a stream:
 * a streaming body would need `duplex: 'half'`, and these are small JSON
 * payloads.
 */
export const asQueryMethod: Middleware = {
	onRequest: async ({ request }) => {
		const url = new URL(request.url);
		url.pathname = url.pathname.replace(/\/search$/, '');
		const body = await request.text();
		return new Request(url, {
			method: 'QUERY',
			headers: request.headers,
			body: body || undefined,
		});
	},
};
