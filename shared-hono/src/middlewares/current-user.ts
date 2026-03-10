import { type Principal, USER_HEADERS } from '@nxgt/shared/models';
import { createMiddleware } from 'hono/factory';

export const currentUser = () =>
	createMiddleware(async (ctx, next) => {
		if (!ctx.req.header(USER_HEADERS.ID)) {
			return next();
		}

		const user: Principal = {
			id: ctx.req.header(USER_HEADERS.ID) || '',
			username: ctx.req.header(USER_HEADERS.USERNAME) || '',
			email: ctx.req.header(USER_HEADERS.EMAIL) || '',
			firstName: ctx.req.header(USER_HEADERS.FIRST_NAME),
			lastName: ctx.req.header(USER_HEADERS.LAST_NAME),
			birthDate: ctx.req.header(USER_HEADERS.BIRTH_DATE)
				? new Date(ctx.req.header(USER_HEADERS.BIRTH_DATE) || '')
				: null,
			authorities: ctx.req.header(USER_HEADERS.AUTHORITIES)?.split(',') || [],
		};

		ctx.set(USER_HEADERS.ID, user.id);
		ctx.set(USER_HEADERS.USERNAME, user.username);
		ctx.set(USER_HEADERS.EMAIL, user.email);
		ctx.set(USER_HEADERS.FIRST_NAME, user.firstName);
		ctx.set(USER_HEADERS.LAST_NAME, user.lastName);
		ctx.set(
			USER_HEADERS.BIRTH_DATE,
			user.birthDate ? user.birthDate.toISOString() : null,
		);
		ctx.set(USER_HEADERS.AUTHORITIES, user.authorities);

		ctx.set('principal', user);

		return next();
	});

export { USER_HEADERS, type Principal };
