import { createMiddleware } from 'hono/factory';
import { USER_HEADERS } from '../models';

export const currentUser = createMiddleware(async (ctx, next) => {
	if (!ctx.req.header('X-User-Id')) {
		return next();
	}

	ctx.req.header('');

	const user = {
		id: ctx.req.header(USER_HEADERS.ID) || '',
		username: ctx.req.header(USER_HEADERS.USERNAME) || '',
		email: ctx.req.header(USER_HEADERS.EMAIL) || '',
		birthDate: ctx.req.header(USER_HEADERS.BIRTH_DATE)
			? new Date(ctx.req.header(USER_HEADERS.BIRTH_DATE) || '')
			: null,
		authorities: ctx.req.header(USER_HEADERS.AUTHORITIES)?.split(',') || [],
	};

	ctx.set('X-User-Id', user.id);
	ctx.set('X-User-Name', user.username);
	ctx.set('X-User-Email', user.email);
	ctx.set(
		'X-User-BirthDate',
		user.birthDate ? user.birthDate.toISOString() : null,
	);
	ctx.set('X-User-Authorities', user.authorities);

	ctx.set('principal', user);
});
