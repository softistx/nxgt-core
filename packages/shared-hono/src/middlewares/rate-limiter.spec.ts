import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { type RateLimiterOptions, rateLimiter } from './rate-limiter';

/**
 * A route behind `rateLimiter(options)`. The limiter is built once per app,
 * as an app does at startup, so its store lives as long as the app.
 */
function app(options?: RateLimiterOptions) {
	const hono = new Hono();
	hono.use('*', rateLimiter(options) as MiddlewareHandler);
	hono.get('/x', (ctx) => ctx.text('ok'));
	hono.get('/fail', (ctx) => ctx.text('nope', 500));
	return hono;
}

/** What hono-rate-limiter puts on the context as `rateLimitStore`. */
const storeOf = (ctx: Context) =>
	(ctx as unknown as { get(key: string): unknown }).get('rateLimitStore') as {
		resetKey(key: string): Promise<void> | void;
	};

/** A request from `ip`, as its `x-forwarded-for`; none at all without one. */
const from = (ip?: string) =>
	ip === undefined ? {} : { headers: { 'x-forwarded-for': ip } };

function hit(hono: Hono, ip?: string, path = '/x') {
	return hono.request(path, from(ip));
}

async function hits(hono: Hono, n: number, ip?: string) {
	const statuses: number[] = [];
	for (let i = 0; i < n; i++) statuses.push((await hit(hono, ip)).status);
	return statuses;
}

describe('rateLimiter() — defaults', () => {
	test('10 requests a minute, with the draft-6 RateLimit-* headers', async () => {
		const hono = app();
		const first = await hit(hono, '10.0.0.1');

		expect(first.status).toBe(200);
		expect(first.headers.get('RateLimit-Policy')).toBe('10;w=60');
		expect(first.headers.get('RateLimit-Limit')).toBe('10');
		expect(first.headers.get('RateLimit-Remaining')).toBe('9');
		expect(first.headers.get('RateLimit-Reset')).toBe('60');
		expect(first.headers.get('RateLimit')).toBeNull();
		expect(first.headers.get('Retry-After')).toBeNull();
	});

	test('the 11th request in the window is a 429 with a text body and Retry-After', async () => {
		const hono = app();

		expect(await hits(hono, 10, '10.0.0.2')).toEqual(Array(10).fill(200));

		const refused = await hit(hono, '10.0.0.2');
		expect(refused.status).toBe(429);
		expect(await refused.text()).toBe(
			'Too many requests, please try again later.',
		);
		expect(refused.headers.get('RateLimit-Remaining')).toBe('0');
		expect(refused.headers.get('Retry-After')).toBe('60');
	});

	test('each limiter has its own in-memory store', async () => {
		const a = app({ limit: 1 });
		const b = app({ limit: 1 });

		expect((await hit(a, '10.0.0.3')).status).toBe(200);
		expect((await hit(b, '10.0.0.3')).status).toBe(200);
		expect((await hit(a, '10.0.0.3')).status).toBe(429);
	});
});

describe('rateLimiter() — window and limit', () => {
	test('limit sets how many requests pass', async () => {
		const hono = app({ limit: 2 });
		const statuses = await hits(hono, 3, '10.0.1.1');

		expect(statuses).toEqual([200, 200, 429]);
	});

	test('limit may be a function of the request', async () => {
		const hono = app({
			limit: (c) => (c.req.header('x-plan') === 'pro' ? 3 : 1),
		});
		const pro = { headers: { 'x-forwarded-for': '10.0.1.2', 'x-plan': 'pro' } };

		expect((await hono.request('/x', pro)).headers.get('RateLimit-Limit')).toBe(
			'3',
		);
		expect((await hit(hono, '10.0.1.3')).headers.get('RateLimit-Limit')).toBe(
			'1',
		);
	});

	test('the counter starts again once windowMs has elapsed', async () => {
		const hono = app({ limit: 1, windowMs: 200 });

		expect(await hits(hono, 2, '10.0.1.4')).toEqual([200, 429]);
		await Bun.sleep(250);
		expect((await hit(hono, '10.0.1.4')).status).toBe(200);
	});

	test('windowMs is advertised in whole seconds, rounded up', async () => {
		const res = await hit(app({ limit: 5, windowMs: 1500 }), '10.0.1.5');

		expect(res.headers.get('RateLimit-Policy')).toBe('5;w=2');
	});
});

describe('rateLimiter() — headers', () => {
	test("standardHeaders: 'draft-7' sends one combined RateLimit header", async () => {
		const res = await hit(
			app({ limit: 3, standardHeaders: 'draft-7' }),
			'10.0.2.1',
		);

		expect(res.headers.get('RateLimit-Policy')).toBe('3;w=60');
		expect(res.headers.get('RateLimit')).toBe('limit=3, remaining=2, reset=60');
		expect(res.headers.get('RateLimit-Limit')).toBeNull();
	});

	test('standardHeaders: false sends none, not even Retry-After on a 429', async () => {
		const hono = app({ limit: 1, standardHeaders: false });
		await hit(hono, '10.0.2.2');
		const refused = await hit(hono, '10.0.2.2');

		expect(refused.status).toBe(429);
		for (const name of ['RateLimit-Policy', 'RateLimit-Limit', 'Retry-After']) {
			expect(refused.headers.get(name)).toBeNull();
		}
	});
});

describe('rateLimiter() — the rest of the options reach hono-rate-limiter', () => {
	test('message and statusCode shape the refusal', async () => {
		const hono = app({
			limit: 1,
			statusCode: 503,
			message: { error: 'slow down' },
		});
		await hit(hono, '10.0.3.1');
		const refused = await hit(hono, '10.0.3.1');

		expect(refused.status).toBe(503);
		expect(await refused.json()).toEqual({ error: 'slow down' });
	});

	test('skip lets a request through uncounted', async () => {
		const hono = app({
			limit: 1,
			skip: (c) => c.req.header('x-internal') === '1',
		});
		const internal = {
			headers: { 'x-forwarded-for': '10.0.3.2', 'x-internal': '1' },
		};

		expect((await hono.request('/x', internal)).status).toBe(200);
		expect((await hono.request('/x', internal)).status).toBe(200);
		expect((await hit(hono, '10.0.3.2')).status).toBe(200);
		expect((await hit(hono, '10.0.3.2')).status).toBe(429);
	});

	test('skipFailedRequests gives a failed request its hit back', async () => {
		const hono = app({ limit: 1, skipFailedRequests: true });

		expect((await hit(hono, '10.0.3.3', '/fail')).status).toBe(500);
		expect((await hit(hono, '10.0.3.3')).status).toBe(200);
		expect((await hit(hono, '10.0.3.3')).status).toBe(429);
	});
});

describe('rateLimiter() — the key', () => {
	test('the default key is the x-forwarded-for header: one bucket per value', async () => {
		const hono = app({ limit: 1 });

		expect((await hit(hono, '10.0.4.1')).status).toBe(200);
		expect((await hit(hono, '10.0.4.2')).status).toBe(200);
		expect((await hit(hono, '10.0.4.1')).status).toBe(429);
	});

	test('the whole header is the key, not its first address', async () => {
		const hono = app({ limit: 1 });

		expect((await hit(hono, '10.0.4.3')).status).toBe(200);
		expect((await hit(hono, '10.0.4.3, 192.0.2.1')).status).toBe(200);
	});

	test('a client that writes its own x-forwarded-for is never limited', async () => {
		// The caveat the README lists under "Things that bite": with nothing in
		// front of the service overwriting the header, a new value per request
		// is a new bucket per request. Pinned, not fixed: the README tells an
		// app behind such a proxy to pass its own keyGenerator.
		const hono = app({ limit: 1 });
		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			statuses.push((await hit(hono, `198.51.100.${i}`)).status);
		}

		expect(statuses).toEqual(Array(5).fill(200));
	});

	test('every request without x-forwarded-for shares one bucket, keyed ""', async () => {
		// Pinned, not fixed: with no header the default key is the empty
		// string, so all such callers — every client of a service reached
		// without a proxy — draw on a single counter, and one of them can
		// spend it for all the others.
		const hono = app({ limit: 2 });

		expect(await hits(hono, 2)).toEqual([200, 200]);
		expect((await hit(hono)).status).toBe(429);
		expect((await hit(hono, '')).status).toBe(429);
	});

	test('a keyGenerator replaces the header entirely', async () => {
		const hono = app({
			limit: 1,
			keyGenerator: (c) => c.req.header('x-api-key') ?? 'anonymous',
		});
		const as = (key: string, ip: string) =>
			hono.request('/x', {
				headers: { 'x-api-key': key, 'x-forwarded-for': ip },
			});

		expect((await as('k1', '10.0.4.4')).status).toBe(200);
		// Another address, same key: refused — the header is not read.
		expect((await as('k1', '10.0.4.5')).status).toBe(429);
		expect((await as('k2', '10.0.4.4')).status).toBe(200);
	});
});

/**
 * A stand-in for the Upstash REST API, enough of it for `RedisStore`:
 * `SCRIPT LOAD`, `EVALSHA` of the increment script, `DECR` and `DEL`, sent
 * one by one or through `/pipeline` (the client's default). String results
 * are base64, as the client asks for them.
 */
function fakeUpstash() {
	const counters = new Map<string, { hits: number; expiresAt: number }>();
	const seen: { authorization: string | null; commands: unknown[][] } = {
		authorization: null,
		commands: [],
	};
	const run = (command: unknown[]): unknown => {
		seen.commands.push(command);
		const [name, ...args] = command.map(String);
		switch (name?.toLowerCase()) {
			case 'script':
				return btoa('fake-sha');
			case 'evalsha': {
				const [, , key, , windowMs] = args as [
					string,
					string,
					string,
					string,
					string,
				];
				const now = Date.now();
				const entry = counters.get(key);
				const live = entry && entry.expiresAt > now ? entry : undefined;
				const next = live
					? { hits: live.hits + 1, expiresAt: live.expiresAt }
					: { hits: 1, expiresAt: now + Number(windowMs) };
				counters.set(key, next);
				return [next.hits, next.expiresAt - now];
			}
			case 'decr': {
				const entry = counters.get(args[0] as string);
				if (entry) entry.hits--;
				return entry?.hits ?? -1;
			}
			case 'del':
				return counters.delete(args[0] as string) ? 1 : 0;
			default:
				throw new Error(`fake Upstash: unexpected command ${name}`);
		}
	};
	const server = Bun.serve({
		port: 0,
		async fetch(req) {
			seen.authorization = req.headers.get('authorization');
			const body = (await req.json()) as unknown[];
			if (new URL(req.url).pathname.endsWith('/pipeline')) {
				return Response.json(
					(body as unknown[][]).map((command) => ({ result: run(command) })),
				);
			}
			return Response.json({ result: run(body) });
		},
	});
	return { url: `http://127.0.0.1:${server.port}`, counters, seen, server };
}

describe('rateLimiter() — Upstash store', () => {
	const upstash = fakeUpstash();
	afterAll(() => upstash.server.stop(true));

	test('a non-redis:// URL is an Upstash REST URL, sent the token as a bearer', async () => {
		const hono = app({ limit: 1, redisUrl: upstash.url, redisToken: 'tok' });

		expect((await hit(hono, '10.0.5.1')).status).toBe(200);
		expect((await hit(hono, '10.0.5.1')).status).toBe(429);
		expect(upstash.seen.authorization).toBe('Bearer tok');
		expect(upstash.counters.get('hrl:10.0.5.1')?.hits).toBe(2);
	});

	test('the counters live in the store, so two limiters on it share them by default', async () => {
		const a = app({ limit: 1, redisUrl: upstash.url, redisToken: 'tok' });
		const b = app({ limit: 1, redisUrl: upstash.url, redisToken: 'tok' });

		expect((await hit(a, '10.0.5.2')).status).toBe(200);
		expect((await hit(b, '10.0.5.2')).status).toBe(429);
	});

	test('resetKey deletes the counter in the store', async () => {
		const hono = app({
			limit: 1,
			redisUrl: upstash.url,
			redisToken: 'tok',
			prefix: 'r:',
		});
		hono.get('/reset', async (ctx) => {
			await storeOf(ctx).resetKey('10.0.5.4');
			return ctx.text('reset');
		});

		expect((await hit(hono, '10.0.5.4')).status).toBe(200);
		expect((await hit(hono, '10.0.5.5', '/reset')).status).toBe(200);
		expect(upstash.counters.has('r:10.0.5.4')).toBe(false);
		expect((await hit(hono, '10.0.5.4')).status).toBe(200);
	});

	test('a prefix keeps a limiter on its own counters', async () => {
		const a = app({
			limit: 1,
			redisUrl: upstash.url,
			redisToken: 'tok',
			prefix: 'a:',
		});
		const b = app({
			limit: 1,
			redisUrl: upstash.url,
			redisToken: 'tok',
			prefix: 'b:',
		});

		expect((await hit(a, '10.0.5.3')).status).toBe(200);
		expect((await hit(b, '10.0.5.3')).status).toBe(200);
		expect(upstash.counters.has('a:10.0.5.3')).toBe(true);
		expect(upstash.counters.has('b:10.0.5.3')).toBe(true);
		expect(upstash.counters.has('hrl:10.0.5.3')).toBe(false);
	});
});

/**
 * Whether `REDIS_URL` names a server, the way shared-mongo's `hasMongoHost()`
 * reads `MONGODB_URI`. CI starts no Redis, so this suite runs only where one
 * is given, e.g. `REDIS_URL=redis://localhost:6379 bun test src`.
 */
function hasRedisHost(uri: string | undefined = Bun.env['REDIS_URL']): boolean {
	if (!uri) return false;
	try {
		return new URL(uri).host !== '';
	} catch {
		return false;
	}
}

describe.skipIf(!hasRedisHost())(
	'rateLimiter() — ioredis store (Redis)',
	() => {
		const redisUrl = Bun.env['REDIS_URL'] as string;
		// One prefix per run, so a rerun inside the window starts from zero.
		const prefix = `shared-hono-spec:${crypto.randomUUID()}:`;
		let limited: Hono;

		beforeAll(() => {
			limited = app({ limit: 1, redisUrl, prefix, skipFailedRequests: true });
		});

		test('a redis:// URL counts in Redis through ioredis', async () => {
			expect((await hit(limited, '10.0.6.1')).status).toBe(200);
			expect((await hit(limited, '10.0.6.1')).status).toBe(429);
		});

		test('decrement reaches Redis: a failed request gives its hit back', async () => {
			expect((await hit(limited, '10.0.6.2', '/fail')).status).toBe(500);
			expect((await hit(limited, '10.0.6.2')).status).toBe(200);
		});

		test('resetKey reaches Redis', async () => {
			expect((await hit(limited, '10.0.6.3')).status).toBe(200);
			expect((await hit(limited, '10.0.6.3')).status).toBe(429);

			// A route behind another limiter on the same prefix, so the same
			// counters, that resets the refused caller's key.
			const resetter = new Hono();
			resetter.use(
				'*',
				rateLimiter({ redisUrl, prefix, limit: 100 }) as MiddlewareHandler,
			);
			resetter.get('/reset', async (ctx) => {
				await storeOf(ctx).resetKey('10.0.6.3');
				return ctx.text('reset');
			});

			expect((await resetter.request('/reset', from('10.0.6.9'))).status).toBe(
				200,
			);
			expect((await hit(limited, '10.0.6.3')).status).toBe(200);
		});
	},
);
