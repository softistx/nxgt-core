import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { HTTPException } from 'hono/http-exception';
import { type Env, env, rawEnv } from '../env';
import { createErrorHandler, type ErrorHandlerOptions } from './error-handler';

/**
 * Every branch of `createErrorHandler()`, through a real Hono app, under each
 * `NODE_ENV` the package knows. `env` is parsed once at import; the handler
 * reads `env.NODE_ENV` on every request, so each block sets it and puts it
 * back.
 */

const translate = (key: string, context?: Record<string, any>): string =>
	context ? `t(${key}, ${JSON.stringify(context)})` : `t(${key})`;

const app = (throws: () => never, options?: ErrorHandlerOptions) => {
	const hono = new Hono();
	hono.get('/boom', () => throws());
	hono.onError(createErrorHandler(translate, options));
	return hono;
};

const call = async (throws: () => never, options?: ErrorHandlerOptions) => {
	const response = await app(throws, options).request('/boom');
	const text = await response.text();
	return { response, text, body: JSON.parse(text) as Record<string, unknown> };
};

const customException = () => {
	throw new CustomException(
		'errors.not-found',
		404,
		{ id: 'abc' },
		'internal detail',
	);
};
const httpException = () => {
	throw new HTTPException(418, { message: 'short and stout' });
};
const plainError = () => {
	throw new Error('internal detail');
};

let logged: unknown[][];
let errorSpy: ReturnType<typeof spyOn>;
const originalNodeEnv = env.NODE_ENV;
const originalRawNodeEnv = rawEnv.NODE_ENV;

beforeEach(() => {
	logged = [];
	errorSpy = spyOn(logger, 'error').mockImplementation(((
		...args: unknown[]
	) => {
		logged.push(args);
		return logger;
	}) as never);
});

afterEach(() => {
	errorSpy.mockRestore();
	env.NODE_ENV = originalNodeEnv;
	rawEnv.NODE_ENV = originalRawNodeEnv;
});

const loggedText = () =>
	logged
		.flat()
		.map((part) => (part instanceof Error ? part.message : String(part)))
		.join('\n');

/** `undefined` is an unset `NODE_ENV`: the parsed `env` defaults it to development, the raw value stays unset. */
const setNodeEnv = (nodeEnv: Env['NODE_ENV'] | undefined) => {
	rawEnv.NODE_ENV = nodeEnv;
	env.NODE_ENV = nodeEnv ?? 'development';
};

const useNodeEnv = (nodeEnv: Env['NODE_ENV'] | undefined) =>
	beforeEach(() => {
		setNodeEnv(nodeEnv);
	});

describe.each(['development', 'test'] as const)(
	'createErrorHandler — NODE_ENV=%s answers with the detail',
	(nodeEnv) => {
		useNodeEnv(nodeEnv);

		test('a CustomException answers its code, the translated message with its options, and its debugMessage', async () => {
			const { response, body } = await call(customException);
			expect(response.status).toBe(404);
			expect(body).toEqual({
				status: 404,
				message: 't(errors.not-found, {"id":"abc"})',
				debugMessage: 'internal detail',
				timestamp: expect.any(String),
			});
			expect(Number.isNaN(Date.parse(body['timestamp'] as string))).toBe(false);
		});

		test('an HTTPException answers its status and message, with its stack as debugMessage', async () => {
			const { response, body } = await call(httpException);
			expect(response.status).toBe(418);
			expect(body).toMatchObject({ status: 418, message: 'short and stout' });
			expect(body['debugMessage']).toContain('short and stout');
			expect(body['debugMessage']).toContain('error-handler.spec.ts');
		});

		test('any other Error answers 500, the translated generic message, and its message as debugMessage', async () => {
			const { response, body } = await call(plainError);
			expect(response.status).toBe(500);
			expect(body).toEqual({
				status: 500,
				message: 't(errors.internal-server-error)',
				debugMessage: 'internal detail',
				timestamp: expect.any(String),
			});
		});
	},
);

describe.each([
	['production', 'production'],
	['unset', undefined],
] as const)(
	'createErrorHandler — NODE_ENV %s answers without the detail',
	(_label, nodeEnv) => {
		useNodeEnv(nodeEnv);

		test('a CustomException answers its code and the translated message with its options, and no debugMessage', async () => {
			const { response, body, text } = await call(customException);
			expect(response.status).toBe(404);
			expect(body).toEqual({
				status: 404,
				message: 't(errors.not-found, {"id":"abc"})',
				timestamp: expect.any(String),
			});
			expect(text).not.toContain('internal detail');
		});

		test('an HTTPException answers its status and message, and no stack', async () => {
			const { response, body, text } = await call(httpException);
			expect(response.status).toBe(418);
			expect(body).toEqual({
				status: 418,
				message: 'short and stout',
				timestamp: expect.any(String),
			});
			expect(text).not.toContain('error-handler.spec.ts');
		});

		test('any other Error answers 500 and the translated generic message only', async () => {
			const { response, body, text } = await call(plainError);
			expect(response.status).toBe(500);
			expect(body).toEqual({
				status: 500,
				message: 't(errors.internal-server-error)',
				timestamp: expect.any(String),
			});
			expect(text).not.toContain('internal detail');
		});

		test.each([
			['a CustomException', customException],
			['an HTTPException', httpException],
			['any other Error', plainError],
		])('%s still reaches the logger with its stack', async (_, throws) => {
			await call(throws);
			const stack = logged.find(
				([first]) => typeof first === 'string' && first.includes('    at '),
			);
			expect(stack).toBeDefined();
		});

		test('the debugMessage of a CustomException reaches the logger', async () => {
			await call(customException);
			expect(loggedText()).toContain('internal detail');
		});

		test('the message of any other Error reaches the logger', async () => {
			await call(plainError);
			expect(loggedText()).toContain('internal detail');
		});
	},
);

describe.each(['development', 'test', 'production'] as const)(
	'createErrorHandler — NODE_ENV=%s, whatever the environment',
	(nodeEnv) => {
		useNodeEnv(nodeEnv);

		test('logs the error itself, between two rules', async () => {
			await call(plainError);
			expect(logged[0]?.[0]).toBe('─'.repeat(60));
			expect(logged[1]).toEqual(['[Global Error]', expect.any(Error)]);
			expect(logged.at(-1)?.[0]).toBe('─'.repeat(60));
		});

		test('logs nothing with logToConsole: false', async () => {
			const { response } = await call(plainError, { logToConsole: false });
			expect(response.status).toBe(500);
			expect(errorSpy).not.toHaveBeenCalled();
		});

		test('a thrown value that is not an Error never reaches the handler', async () => {
			const thrown = { reason: 'not an Error' };
			const throws = (): never => {
				throw thrown;
			};
			// Hono hands only an Error to onError and rethrows anything else.
			await expect(
				Promise.resolve().then(() => app(throws).request('/boom')),
			).rejects.toBe(thrown);
			expect(errorSpy).not.toHaveBeenCalled();
		});
	},
);

describe('createErrorHandler — the stack in the log', () => {
	const stackLogged = () =>
		logged.some(
			([first]) => typeof first === 'string' && first.includes('    at '),
		);

	test.each<[Env['NODE_ENV'] | undefined, ErrorHandlerOptions, boolean]>([
		['development', {}, true],
		['development', { showStackInDev: false }, false],
		['test', {}, false],
		['test', { showStackInTest: true }, true],
		['production', {}, true],
		['production', { showStackInDev: false, showStackInTest: false }, true],
		[undefined, {}, true],
		[undefined, { showStackInDev: false, showStackInTest: false }, true],
	])('NODE_ENV=%s with %o logs it: %p', async (nodeEnv, options, expected) => {
		setNodeEnv(nodeEnv);
		await call(plainError, options);
		expect(stackLogged()).toBe(expected);
	});
});

describe('createErrorHandler — an HTTPException that carries a response', () => {
	beforeEach(() => setNodeEnv('production'));

	test("keeps the response's headers, as Hono's own handler does, and still answers JSON", async () => {
		const hono = new Hono();
		hono.use('/private', basicAuth({ username: 'u', password: 'p' }));
		hono.get('/private', (c) => c.text('ok'));
		hono.onError(createErrorHandler(translate));

		const response = await hono.request('/private');
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toBe(
			'Basic realm="Secure Area"',
		);
		expect(response.headers.get('content-type')).toStartWith(
			'application/json',
		);
		// basicAuth puts "Unauthorized" in its response's body, not in the
		// exception's message, which is what the JSON body carries.
		expect(await response.json()).toMatchObject({ status: 401, message: '' });
	});

	test('keeps a custom header but never the body headers of the response it replaces', async () => {
		const { response, body } = await call(() => {
			throw new HTTPException(429, {
				message: 'slow down',
				res: new Response('a much longer plain text body', {
					headers: {
						'Retry-After': '30',
						'Content-Type': 'text/plain',
						'Content-Length': '29',
					},
				}),
			});
		});
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('30');
		expect(response.headers.get('content-type')).toStartWith(
			'application/json',
		);
		expect(response.headers.get('content-length')).not.toBe('29');
		expect(body).toMatchObject({ status: 429, message: 'slow down' });
	});

	test('appends every cookie after the ones a middleware set before the throw', async () => {
		const hono = new Hono();
		hono.use(async (c, next) => {
			c.header('Set-Cookie', 'session=early; Path=/', { append: true });
			await next();
		});
		hono.get('/boom', () => {
			const res = new Response(null);
			res.headers.append('Set-Cookie', 'a=1; Path=/');
			res.headers.append('Set-Cookie', 'b=2; Path=/');
			throw new HTTPException(401, { message: 'again', res });
		});
		hono.onError(createErrorHandler(translate));

		const response = await hono.request('/boom');
		expect(response.headers.getSetCookie()).toEqual([
			'session=early; Path=/',
			'a=1; Path=/',
			'b=2; Path=/',
		]);
	});

	test("copies neither the replaced body's headers nor the hop-by-hop ones, but keeps Content-Range", async () => {
		const skipped = {
			'Content-Disposition': 'attachment; filename=x.html',
			'Content-Digest': 'sha-256=:abc=:',
			'Repr-Digest': 'sha-256=:abc=:',
			'Content-MD5': 'abc==',
			ETag: '"abc"',
			'Last-Modified': 'Mon, 12 Oct 2026 00:00:00 GMT',
			Connection: 'close',
			'Keep-Alive': 'timeout=5',
			'Proxy-Connection': 'close',
			TE: 'trailers',
			Trailer: 'X-T',
			Upgrade: 'websocket',
		};
		const { response } = await call(() => {
			throw new HTTPException(416, {
				message: 'out of range',
				res: new Response(null, {
					headers: { ...skipped, 'Content-Range': 'bytes */100' },
				}),
			});
		});
		for (const name of Object.keys(skipped))
			expect({ name, value: response.headers.get(name) }).toEqual({
				name,
				value: null,
			});
		expect(response.headers.get('content-range')).toBe('bytes */100');
	});
});
