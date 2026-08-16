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
