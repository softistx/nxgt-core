import { randomUUIDv7 } from 'bun';
import { createMiddleware } from 'hono/factory';
import { logger } from './logger';

export function loggerProvider() {
	return createMiddleware(async (ctx, next) => {
		logger.child({
			requestId: ctx.get('requestId') || randomUUIDv7(),
		});
		ctx.set('logger', logger);
		await next();
	});
}
