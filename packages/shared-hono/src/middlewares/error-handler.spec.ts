import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type Env, env } from '../env';
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
});

const loggedText = () =>
	logged
		.flat()
		.map((part) => (part instanceof Error ? part.message : String(part)))
		.join('\n');

const useNodeEnv = (nodeEnv: Env['NODE_ENV']) =>
	beforeEach(() => {
		env.NODE_ENV = nodeEnv;
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

describe('createErrorHandler — NODE_ENV=production answers without the detail', () => {
	useNodeEnv('production');

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
});

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

	test.each<[Env['NODE_ENV'], ErrorHandlerOptions, boolean]>([
		['development', {}, true],
		['development', { showStackInDev: false }, false],
		['test', {}, false],
		['test', { showStackInTest: true }, true],
		['production', {}, true],
		['production', { showStackInDev: false, showStackInTest: false }, true],
	])('NODE_ENV=%s with %o logs it: %p', async (nodeEnv, options, expected) => {
		env.NODE_ENV = nodeEnv;
		await call(plainError, options);
		expect(stackLogged()).toBe(expected);
	});
});
