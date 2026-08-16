import { logger } from '@nxgt/shared-logging';
import { Redis as UpstashRedis } from '@upstash/redis';
import {
	type HonoConfigProps,
	rateLimiter as honoRateLimiter,
	type RedisClient,
	RedisStore,
} from 'hono-rate-limiter';
import IORedis from 'ioredis';

export type RateLimiterOptions = Omit<HonoConfigProps, 'keyGenerator'> & {
	/**
	 * Either a standard `redis://`/`rediss://` connection string (backed by
	 * `ioredis`, for a self-hosted Redis) or an Upstash REST URL
	 * (`https://...`, backed by `@upstash/redis`, requires `redisToken`).
	 */
	redisUrl?: string;
	/** Upstash REST token — only used when `redisUrl` is an Upstash URL. */
	redisToken?: string;
	/**
	 * Redis key prefix for this limiter's counters. `RedisStore` defaults to
	 * a fixed `"hrl:"` prefix, so two `rateLimiter()` instances pointed at
	 * the same Redis (e.g. a global limiter and a stricter per-route one)
	 * silently share counters unless given distinct prefixes here.
	 */
	prefix?: string;
	keyGenerator?: HonoConfigProps['keyGenerator'];
};

/**
 * Adapts a standard `ioredis` client to the bespoke `RedisClient` shape
 * `hono-rate-limiter`'s `RedisStore` expects (mirroring what `@upstash/redis`
 * natively implements), so a plain self-hosted Redis (`redis://...`) can back
 * the same `RedisStore` used for Upstash.
 */
function ioredisAdapter(client: IORedis): RedisClient {
	return {
		scriptLoad: (script) => client.script('LOAD', script) as Promise<string>,
		evalsha: (sha1, keys, args) =>
			client.evalsha(sha1, keys.length, ...keys, ...(args as string[])) as any,
		decr: (key) => client.decr(key),
		del: (key) => client.del(key),
	};
}

function redisClientFor(redisUrl: string, redisToken?: string): RedisClient {
	if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
		const client = new IORedis(redisUrl);
		client.on('error', (err) => {
			logger.error(`[rate-limiter] Redis connection error: ${err.message}`);
		});
		return ioredisAdapter(client);
	}
	return new UpstashRedis({
		url: redisUrl,
		token: redisToken,
	}) as unknown as RedisClient;
}

export function rateLimiter(options?: RateLimiterOptions) {
	return honoRateLimiter({
		...options,
		windowMs: options?.windowMs ?? 1 * 60 * 1000,
		limit: options?.limit ?? 10,
		keyGenerator:
			options?.keyGenerator ?? ((c) => c.req.header('x-forwarded-for') ?? ''),
		store: options?.redisUrl
			? new RedisStore({
					client: redisClientFor(options.redisUrl, options.redisToken),
					prefix: options.prefix,
				})
			: undefined,
	});
}
