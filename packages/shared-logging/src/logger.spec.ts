import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import { Hono } from 'hono';
import winston from 'winston';

// The default `logger` is created at import time and reads `LOG_TAG` then, so a
// shell that exports `LOG_TAG` would change every `[app]` assertion below. The
// variable is cleared for the import only, then put back.
const shellTag = Bun.env['LOG_TAG'];
delete Bun.env['LOG_TAG'];
const { createLogger, logger } = await import('./logger');
const { loggerProvider } = await import('./logger.middleware');
if (shellTag !== undefined) Bun.env['LOG_TAG'] = shellTag;

// Winston colorizes the level and the message (`colorize({ all: true })`).
// The assertions are about the text, so the escape codes are stripped.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes
const ANSI = /\u001b\[[0-9;]*m/g;

let lines: string[] = [];
let transport: winston.transport;

beforeEach(() => {
	lines = [];
	transport = new winston.transports.Stream({
		stream: new Writable({
			write(chunk, _encoding, done) {
				lines.push(String(chunk).replace(ANSI, '').trimEnd());
				done();
			},
		}),
	});
	logger.add(transport);
});

afterEach(() => {
	logger.remove(transport);
});

describe('base logger line format', () => {
	test('a line without a requestId is `[timestamp] [label] [level] message`', () => {
		logger.info('hello');
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(
			/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[app\] \[info\] hello$/,
		);
	});

	// OWNER QUESTION: the pattern is `YYYY-DD-MM`, day before month. Pinned as
	// it is so a change is deliberate; consumers' parsers may depend on it.
	test('the timestamp is YYYY-DD-MM (day before month), as shipped', () => {
		logger.info('hello');
		const [, year, first, second] =
			/^\[(\d{4})-(\d{2})-(\d{2}) /.exec(lines[0] ?? '') ?? [];
		const now = new Date();
		expect(year).toBe(String(now.getFullYear()));
		expect(first).toBe(String(now.getDate()).padStart(2, '0'));
		expect(second).toBe(String(now.getMonth() + 1).padStart(2, '0'));
	});

	test("the default label is 'app' and `tag` overrides it", () => {
		const tagged = createLogger({
			name: 'spec-tagged',
			tag: 'orders',
			disableConsole: true,
		});
		const seen: string[] = [];
		tagged.add(
			new winston.transports.Stream({
				stream: new Writable({
					write(chunk, _e, done) {
						seen.push(String(chunk).replace(ANSI, '').trimEnd());
						done();
					},
				}),
			}),
		);
		tagged.info('x');
		logger.info('y');
		expect(seen[0]).toContain('[orders] [info] x');
		expect(lines[0]).toContain('[app] [info] y');
	});
});

describe('logging an error', () => {
	test("prints its message and leaves the error's own message untouched", () => {
		const error = new Error('disk full');
		logger.error(error);
		expect(lines.at(-1)).toEndWith('[error] disk full');
		expect(error.message).toBe('disk full');
	});

	test('an error whose message is read-only (DOMException) is logged, not thrown', () => {
		const error = new DOMException('The operation was aborted.', 'AbortError');
		expect(() => logger.error(error)).not.toThrow();
		expect(lines.at(-1)).toEndWith('[error] The operation was aborted.');
	});

	test('an error given as metadata keeps its message too', () => {
		const error = new Error('meta');
		logger.error('context', error);
		expect(lines.at(-1)).toEndWith('[error] context meta');
		expect(error.message).toBe('meta');
	});
});

describe('loggerProvider', () => {
	function appWithProbe() {
		const app = new Hono();
		app.use('*', loggerProvider());
		app.get('/', (ctx) => {
			ctx.get('logger').info('from the handler');
			return ctx.json({ same: ctx.get('logger') === logger });
		});
		return app;
	}

	test('puts a child logger, not the base logger, on the context', async () => {
		const res = await appWithProbe().request('/');
		expect(await res.json()).toEqual({ same: false });
	});

	test('a line logged through it carries the requestId', async () => {
		await appWithProbe().request('/');
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(
			/^\[[^\]]+\] \[app\] \[info\] \[requestId=[0-9a-f-]{36}\] from the handler$/,
		);
	});

	test('reuses a requestId already on the context', async () => {
		const app = new Hono();
		app.use('*', async (ctx, next) => {
			ctx.set('requestId', 'req-42');
			await next();
		});
		app.use('*', loggerProvider());
		app.get('/', (ctx) => {
			ctx.get('logger').warn('seen');
			return ctx.text('ok');
		});
		await app.request('/');
		expect(lines[0]).toEndWith('[warn] [requestId=req-42] seen');
	});

	test('two requests get two different ids', async () => {
		const app = appWithProbe();
		await app.request('/');
		await app.request('/');
		const ids = lines.map((l) => /requestId=([^\]]+)/.exec(l)?.[1]);
		expect(ids[0]).toBeDefined();
		expect(ids[0]).not.toBe(ids[1]);
	});

	test('the base logger is untouched afterwards', async () => {
		await appWithProbe().request('/');
		lines.length = 0;
		logger.info('after');
		expect(lines[0]).toEndWith('[app] [info] after');
		expect(lines[0]).not.toContain('requestId');
	});
});

// `LOG_TAG` is read when a logger is created, like `LOG_LEVEL`. The default
// `logger` is created at import time, so these specs set the environment first
// and import a fresh copy of the module through a unique query string, which
// Bun treats as a separate module instance (no subprocess needed).
describe('LOG_TAG', () => {
	const saved = Bun.env['LOG_TAG'];
	let n = 0;

	afterEach(() => {
		if (saved === undefined) delete Bun.env['LOG_TAG'];
		else Bun.env['LOG_TAG'] = saved;
	});

	async function freshModule() {
		return (await import(
			`./logger?log-tag-${n++}`
		)) as typeof import('./logger');
	}

	function capture(target: winston.Logger): string[] {
		const seen: string[] = [];
		target.add(
			new winston.transports.Stream({
				stream: new Writable({
					write(chunk, _e, done) {
						seen.push(String(chunk).replace(ANSI, '').trimEnd());
						done();
					},
				}),
			}),
		);
		return seen;
	}

	test('names the label of the default instance and of createLogger without `tag`', async () => {
		Bun.env['LOG_TAG'] = 'billing';
		const mod = await freshModule();
		const seenDefault = capture(mod.logger);
		const created = mod.createLogger({
			name: 'spec-env',
			disableConsole: true,
		});
		const seenCreated = capture(created);
		mod.logger.info('a');
		created.info('b');
		expect(seenDefault[0]).toContain('[billing] [info] a');
		expect(seenCreated[0]).toContain('[billing] [info] b');
	});

	test('the request child of the default logger carries it', async () => {
		Bun.env['LOG_TAG'] = 'billing';
		const mod = await freshModule();
		const seen = capture(mod.logger);
		mod.logger.child({ requestId: 'r1' }).info('c');
		expect(seen[0]).toContain('[billing] [info] [requestId=r1] c');
	});

	test('`tag` beats LOG_TAG', async () => {
		Bun.env['LOG_TAG'] = 'billing';
		const mod = await freshModule();
		const tagged = mod.createLogger({
			name: 'spec-env-tag',
			tag: 'orders',
			disableConsole: true,
		});
		const seen = capture(tagged);
		tagged.info('d');
		expect(seen[0]).toContain('[orders] [info] d');
	});

	test('empty gives `app`', async () => {
		Bun.env['LOG_TAG'] = '';
		const mod = await freshModule();
		const seen = capture(mod.logger);
		mod.logger.info('f');
		expect(seen[0]).toContain('[app] [info] f');
	});

	test('unset gives `app`', async () => {
		delete Bun.env['LOG_TAG'];
		const mod = await freshModule();
		const seen = capture(mod.logger);
		mod.logger.info('e');
		expect(seen[0]).toContain('[app] [info] e');
	});
});
