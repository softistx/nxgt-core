import { USER_HEADERS } from '@nxgt/shared/models';
import { tryGetContext } from 'hono/context-storage';
import type { Middleware } from 'openapi-fetch';

export function openfetchServiceUser(): Middleware {
	const ctx = tryGetContext();
	return {
		async onRequest({ request }) {
			if (ctx?.get(USER_HEADERS.ID)) {
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
					USER_HEADERS.REALM,
					ctx.get(USER_HEADERS.REALM) || '',
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
