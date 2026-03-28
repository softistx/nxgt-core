import { Redis } from '@upstash/redis';
import {
	type HonoConfigProps,
	rateLimiter as honoRateLimiter,
	RedisStore,
} from 'hono-rate-limiter';

export type RateLimiterOptions = Omit<HonoConfigProps, 'keyGenerator'> & {
	redisUrl?: string;
	redisToken?: string;
	keyGenerator?: HonoConfigProps['keyGenerator'];
};

export function rateLimiter(options?: RateLimiterOptions) {
	return honoRateLimiter({
		...options,
		windowMs: options?.windowMs ?? 1 * 60 * 1000,
		limit: options?.limit ?? 10,
		keyGenerator:
			options?.keyGenerator ?? ((c) => c.req.header('x-forwarded-for') ?? ''),
		store: options?.redisUrl
			? new RedisStore({
					client: new Redis({
						url: options?.redisUrl,
						token: options?.redisToken,
					}),
				})
			: undefined,
	});
}
