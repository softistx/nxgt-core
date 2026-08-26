import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { mongoose } from '@nxgt/shared-mongo';
import type { Context } from 'hono';
import type { Middleware } from 'openapi-fetch';

/**
 * Inverse of `mockAuthMiddleware`: reads the `X-User-*` headers it injects
 * back into a `Principal`. For services that verify tokens themselves
 * (zero-trust, no gateway in front) but still want their existing route
 * specs — written against `mockAuthMiddleware` — to work unchanged in
 * NODE_ENV=test. Returns `undefined` when no mock headers are present, so
 * callers can fall back to real token verification.
 */
export function principalFromMockHeaders(ctx: Context): Principal | undefined {
	if (
		!ctx.req.header(USER_HEADERS.ID) &&
		!ctx.req.header(USER_HEADERS.CLIENT)
	) {
		return undefined;
	}

	const principal: Principal = {
		id: ctx.req.header(USER_HEADERS.ID),
		username: ctx.req.header(USER_HEADERS.USERNAME),
		email: ctx.req.header(USER_HEADERS.EMAIL),
		firstName: ctx.req.header(USER_HEADERS.FIRST_NAME),
		lastName: ctx.req.header(USER_HEADERS.LAST_NAME),
		birthDate: ctx.req.header(USER_HEADERS.BIRTH_DATE)
			? new Date(ctx.req.header(USER_HEADERS.BIRTH_DATE) || '')
			: null,
		authorities: ctx.req.header(USER_HEADERS.AUTHORITIES)?.split(',') || [],
		clientId: ctx.req.header(USER_HEADERS.CLIENT) || null,
		roles: ctx.req.header(USER_HEADERS.ROLES)?.split(',') || [],
		scopes: ctx.req.header(USER_HEADERS.SCOPES)?.split(',') || [],
	};
	principal.name = principal.username || principal.clientId || undefined;
	return principal;
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

export function mockAuthMiddleware(user: Principal): Middleware {
	return {
		async onRequest({ request }) {
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
