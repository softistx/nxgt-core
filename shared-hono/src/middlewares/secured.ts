import { CustomException } from '@nxgt/shared-exceptions';
import { getLogger } from '@nxgt/shared-logging';
import { isScopeAuthority } from '@nxgt/shared/helpers';
import { createMiddleware } from 'hono/factory';

/**
 * Route guard middleware following Apollo Federation requireScopes semantics.
 *
 * `authorities` is an **array of groups** (array of arrays):
 *  - Outer array = AND  — every group must be satisfied.
 *  - Inner array = OR   — at least one authority in the group must match.
 *
 * Examples:
 *   secured()                          — authentication check only
 *   secured([['ADMIN', 'users:read']]) — ADMIN or users:read
 *   secured([['ADMIN'], ['users:read']]) — ADMIN and users:read
 *
 * For confidential-client principals (clientId present, no username) only
 * SCOPE_* authorities are considered — role/permission entries are ignored.
 */
export function secured(authorities: string[][] = []) {
	return createMiddleware(async (ctx, next) => {
		const logger = ctx.get('logger') || getLogger();

		logger.info('Secured middleware: checking authorities');
		const user = ctx.get('principal');

		if (!user) {
			logger.error('Unauthenticated access attempt');
			throw CustomException.unauthorized({
				message: 'errors.unauthenticated',
			});
		}

		logger.info(
			`User authenticated: ${user.name ?? user.username ?? user.clientId}`,
		);

		if (!authorities.length) {
			await next();
			return;
		}

		// For confidential clients, only SCOPE_* authorities are considered —
		// role/permission entries are ignored. If the client lacks the required
		// scope authority it is denied.
		const isClient = !!user.clientId && !user.username;
		const userAuthorities = user.authorities ?? [];
		const effectiveUserAuthorities = isClient
			? userAuthorities.filter(isScopeAuthority)
			: userAuthorities;

		const granted = authorities.every((group) => {
			if (group.length === 0) return true;
			return group.some((authority) =>
				effectiveUserAuthorities.includes(authority),
			);
		});

		if (granted) {
			await next();
			return;
		}

		throw CustomException.forbidden({
			message: 'errors.forbidden',
		});
	});
}
