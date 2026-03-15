import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { logger } from '@nxgt/shared-logging';
import { createMiddleware } from 'hono/factory';

export const currentUser = () =>
	createMiddleware(async (ctx, next) => {
		logger.warn(ctx.req.header(USER_HEADERS.CLIENT));
		if (
			!ctx.req.header(USER_HEADERS.ID) ||
			!ctx.req.header(USER_HEADERS.CLIENT)
		) {
			return next();
		}

		const user: Principal = {
			id: ctx.req.header(USER_HEADERS.ID),
			username: ctx.req.header(USER_HEADERS.USERNAME),
			email: ctx.req.header(USER_HEADERS.EMAIL),
			firstName: ctx.req.header(USER_HEADERS.FIRST_NAME),
			lastName: ctx.req.header(USER_HEADERS.LAST_NAME),
			birthDate: ctx.req.header(USER_HEADERS.BIRTH_DATE)
				? new Date(ctx.req.header(USER_HEADERS.BIRTH_DATE) || '')
				: null,
			authorities: ctx.req.header(USER_HEADERS.AUTHORITIES)?.split(',') || [],
			realm: ctx.req.header(USER_HEADERS.REALM) || null,
			clientId: ctx.req.header(USER_HEADERS.CLIENT) || null,
			roles: ctx.req.header(USER_HEADERS.ROLES)?.split(',') || [],
			scopes: ctx.req.header(USER_HEADERS.SCOPES)?.split(',') || [],
		};

		user.name = user.username || user.clientId || undefined;

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
		ctx.set(USER_HEADERS.CLIENT, ctx.req.header(USER_HEADERS.CLIENT) || null);
		ctx.set(USER_HEADERS.REALM, ctx.req.header(USER_HEADERS.REALM) || null);
		ctx.set(
			USER_HEADERS.ROLES,
			ctx.req.header(USER_HEADERS.ROLES)?.split(',') || [],
		);
		ctx.set(
			USER_HEADERS.SCOPES,
			ctx.req.header(USER_HEADERS.SCOPES)?.split(',') || [],
		);

		ctx.set('principal', user);

		return next();
	});

export { type Principal, USER_HEADERS };
