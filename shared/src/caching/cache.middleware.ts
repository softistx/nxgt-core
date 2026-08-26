import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
	checkEntityForCaching,
	checkListForCaching,
	checkPageForCaching,
	generateEntityEtag,
	generateEtagForList,
} from './catche.utils';

export type CacheMiddlewareOptions = {
	prefix?: string;
	generateEtag?: (context: Context) => string;
	maxAge?: number;
};

export const cache = ({
	prefix,
	generateEtag,
	maxAge = 3600,
}: CacheMiddlewareOptions = {}) => {
	return createMiddleware(async (ctx, next) => {
		try {
			await next();
			if (ctx.res.status === 200) {
				const res = ctx.res.clone();
				const result = await res.json();
				if (!result) {
					return;
				}
				// `QUERY` is safe and idempotent by definition, so it needs no
				// path check the way `POST` does — a `POST` is only cacheable
				// here because `…/search` is known to be a read in disguise.
				// See `acceptQuery()` in `@nxgt/shared-hono`.
				if (
					ctx.req.method === 'GET' ||
					ctx.req.method === 'QUERY' ||
					(ctx.req.method === 'POST' && ctx.req.path.includes('/search'))
				) {
					ctx.header('Cache-Control', `public, max-age=${maxAge}`);
					if (
						result.data &&
						Array.isArray(result.data) &&
						result.data.length > 0
					) {
						checkPageForCaching(
							result,
							prefix,
							generateEtag?.(ctx) ?? generateEtagForList(result.data, prefix),
						);
					} else if (Array.isArray(result) && result.length > 0) {
						checkListForCaching(
							result,
							prefix,
							generateEtag?.(ctx) ?? generateEntityEtag(result, prefix),
						);
					} else if (ctx.req.method === 'GET') {
						checkEntityForCaching(
							result,
							prefix,
							generateEtag?.(ctx) ?? generateEntityEtag(result, prefix),
						);
					}
				}
			}
		} catch (error) {
			console.error(error);
		}
	});
};
