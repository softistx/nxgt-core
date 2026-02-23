import { getLogger } from '@nxgt/shared/logging';
import { CustomException } from '@nxgt/shared-exceptions';
import { createMiddleware } from 'hono/factory';

export function secured(
	authorities: string[] | string = [],
	include: 'all' | 'any' = 'any',
) {
	return createMiddleware(async (ctx, next) => {
		const logger = ctx.get('logger') || getLogger();

		logger.info('Secured middleware: checking authorities');
		const user = ctx.get('principal');

		if (!user) {
			logger.error(`Unauthenticated access attempt`);
			throw CustomException.unauthorized({
				message: 'errors.unauthenticated',
			});
		}
		logger.info(`User authenticated: ${user.username}`);
		if (!authorities.length) {
			await next();
			return;
		}
		if (Array.isArray(authorities)) {
			if (
				include === 'any' &&
				user.authorities?.some((authority) => authorities.includes(authority))
			) {
				await next();
				return;
			}

			if (
				user.authorities?.filter((authority) => authorities.includes(authority))
					.length === authorities.length
			) {
				await next();
				return;
			}
		} else if (user.authorities?.includes(authorities)) {
			await next();
			return;
		}
		throw CustomException.forbidden({
			message: 'errors.forbidden',
		});
	});
}
