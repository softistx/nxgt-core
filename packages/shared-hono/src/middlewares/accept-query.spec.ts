import { describe, expect, test } from 'bun:test';
import { CustomException } from '@nxgt/shared-exceptions';
import { type Context, Hono } from 'hono';
import { ACCEPT_QUERY_MEDIA_TYPE, acceptQuery } from './accept-query';
import { createErrorHandler } from './error-handler';

/**
 * The resource as an app registers it: QUERY carries `acceptQuery()`, the
 * `POST …/search` route it shares its handler with does not.
 */
function app(mount: (hono: Hono) => void) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	mount(hono);
	return hono;
}

const query = (hono: Hono, path = '/tags') =>
	hono.request(path, {
		method: 'QUERY',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	});

describe('acceptQuery', () => {
	test('advertises application/json by default', async () => {
		expect(ACCEPT_QUERY_MEDIA_TYPE).toBe('application/json');

		const hono = app((a) =>
			a.on('QUERY', '/tags', acceptQuery(), (ctx) => ctx.json([])),
		);
		const res = await query(hono);

		expect(res.status).toBe(200);
		expect(res.headers.get('Accept-Query')).toBe('application/json');
		expect(await res.json()).toEqual([]);
	});

	test('advertises the media types it is given, verbatim', async () => {
		const hono = app((a) =>
			a.on(
				'QUERY',
				'/tags',
				acceptQuery('application/json, application/x-www-form-urlencoded'),
				(ctx) => ctx.json([]),
			),
		);

		expect((await query(hono)).headers.get('Accept-Query')).toBe(
			'application/json, application/x-www-form-urlencoded',
		);
	});

	test('lands on an error response too, since it is set after next()', async () => {
		const hono = app((a) =>
			a.on('QUERY', '/tags', acceptQuery(), () => {
				throw CustomException.forbidden({ message: 'errors.forbidden' });
			}),
		);
		const res = await query(hono);

		expect(res.status).toBe(403);
		expect(res.headers.get('Accept-Query')).toBe('application/json');
	});

	test('overwrites an Accept-Query the handler set itself', async () => {
		const hono = app((a) =>
			a.on('QUERY', '/tags', acceptQuery(), (ctx) => {
				ctx.header('Accept-Query', 'text/plain');
				return ctx.json([]);
			}),
		);

		expect((await query(hono)).headers.get('Accept-Query')).toBe(
			'application/json',
		);
	});

	test('leaves the POST …/search route sharing the handler untouched', async () => {
		const handler = (ctx: Context) => ctx.json([]);
		const hono = app((a) => {
			a.on('QUERY', '/tags', acceptQuery(), handler);
			a.post('/tags/search', handler);
		});
		const res = await hono.request('/tags/search', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});

		expect(res.status).toBe(200);
		expect(res.headers.get('Accept-Query')).toBeNull();
	});
});
