import { CustomException } from '@nxgt/shared-exceptions';
import { getLogger } from '@nxgt/shared-logging';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { USER_HEADERS } from './current-user';

/**
 * Predefined `getRealmId` providers for use with `requireRealmUser`.
 *
 * Each factory returns a function compatible with the `getRealmId` parameter.
 * The `field` argument defaults to `'realm'` in all cases.
 *
 * @example
 * requireRealmUser(realmFrom.path('id'))            // path param  :id
 * requireRealmUser(realmFrom.body())                // JSON body   { realm: '...' }
 * requireRealmUser(realmFrom.query())               // query param ?realm=...
 * requireRealmUser(realmFrom.header('X-Realm-Id'))  // request header
 */
export const realmFrom = {
	path:
		(field = 'id') =>
		(ctx: Context): string | null =>
			ctx.req.param(field) ?? null,

	query:
		(field = 'realm') =>
		(ctx: Context): string | null =>
			ctx.req.query(field) ?? null,

	header:
		(field = USER_HEADERS.REALM) =>
		(ctx: Context): string | null =>
			ctx.req.header(field) ?? null,

	body:
		(field = 'realm') =>
		async (ctx: Context): Promise<string | null> =>
			((await ctx.req.json())[field] as string | undefined) ?? null,
};

/**
 * Hono middleware to enforce that the authenticated user belongs to the realm specified in the request.
 *
 * The realm ID is extracted using the provided `getRealmId` function, which can
 * pull it from any part of the request (e.g. path, query, header, body).
 * If the user has the `ADMIN` authority, they bypass realm checks and are always allowed.
 *
 * @param getRealmId - A function that extracts the realm ID from the request context.
 * @returns Hono middleware that validates realm membership.
 */
export function requireRealmUser(
	getRealmId: (
		ctx: Context,
	) => string | null | undefined | Promise<string | null | undefined>,
) {
	return createMiddleware(async (ctx, next) => {
		const logger = ctx.get('logger') || getLogger();
		const user = ctx.get('principal');

		if (!user) {
			logger.error('Unauthenticated access attempt (requireRealmUser)');
			throw CustomException.unauthorized({ message: 'errors.unauthenticated' });
		}

		// Global ADMIN bypasses realm-level checks entirely
		if (user.authorities?.includes('ADMIN')) {
			await next();
			return;
		}

		const realmId = await getRealmId(ctx);

		// If no realmId is supplied (e.g. creating a global role), skip the realm check
		if (!realmId) {
			await next();
			return;
		}

		if (realmId !== user.realm) {
			logger.error(
				`User ${user.username} does not meet realm access for realm ${realmId}`,
			);
			throw CustomException.forbidden({ message: 'errors.forbidden' });
		}

		await next();
	});
}
