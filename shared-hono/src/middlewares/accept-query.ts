import { createMiddleware } from 'hono/factory';

/** Media types accepted in a QUERY request body, advertised by `acceptQuery()`. */
export const ACCEPT_QUERY_MEDIA_TYPE = 'application/json';

/**
 * Advertises QUERY support on a resource.
 *
 * `Accept-Query` is how the safe-method-with-body draft says a resource
 * announces both that it answers QUERY *and* which media types it will accept
 * in the request content. It rides on the QUERY registration only: the
 * `POST …/search` route it shares its handlers with is left exactly as it was,
 * headers included, so that every existing caller sees no change at all.
 *
 * Set after `next()` so it lands on whatever the handler produced, errors
 * included.
 */
export function acceptQuery(mediaTypes: string = ACCEPT_QUERY_MEDIA_TYPE) {
	return createMiddleware(async (ctx, next) => {
		await next();
		ctx.header('Accept-Query', mediaTypes);
	});
}
