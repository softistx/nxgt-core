import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Writable } from 'node:stream';
import { Hono } from 'hono';
import winston from 'winston';
import { createLogger, logger } from './logger';
import { loggerProvider } from './logger.middleware';

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
			/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] \[sellix\] \[info\] hello$/,
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

	// OWNER QUESTION: the default label is 'sellix', a product name in a shared
	// package. Pinned as it is.
	test("the default label is 'sellix' and `tag` overrides it", () => {
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
		expect(lines[0]).toContain('[sellix] [info] y');
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
			/^\[[^\]]+\] \[sellix\] \[info\] \[requestId=[0-9a-f-]{36}\] from the handler$/,
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
		expect(lines[0]).toEndWith('[sellix] [info] after');
		expect(lines[0]).not.toContain('requestId');
	});
});
