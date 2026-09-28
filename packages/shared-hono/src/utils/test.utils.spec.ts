import { describe, expect, test } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import type { Middleware } from 'openapi-fetch';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from '../middlewares';
import {
	mockAuthMiddleware,
	mockUser,
	principalFromMockHeaders,
} from './test.utils';

const SECRET = 'a-gateway-secret-of-32-characters';

/** Runs one openapi-fetch middleware's `onRequest` over a bare request. */
async function sent(middleware: Middleware): Promise<Headers> {
	const request = new Request('http://service.test/me');
	const result = await middleware.onRequest?.({ request } as never);
	return (result instanceof Request ? result : request).headers;
}

describe('mockAuthMiddleware', () => {
	const user = mockUser({ username: 'ada', roles: ['ADMIN'] });

	test('sends the gateway secret it is given', async () => {
		const headers = await sent(mockAuthMiddleware(user, { secret: SECRET }));
		expect(headers.get(GATEWAY_SECRET_HEADER)).toBe(SECRET);
		expect(headers.get(USER_HEADERS.ID)).toBe(user.id ?? '');
	});

	test('in the header it is told to', async () => {
		const headers = await sent(
			mockAuthMiddleware(user, { secret: SECRET, header: 'x-mesh' }),
		);
		expect(headers.get('x-mesh')).toBe(SECRET);
	});

	test('sends no proof without one', async () => {
		const headers = await sent(mockAuthMiddleware(user));
		expect(headers.get(GATEWAY_SECRET_HEADER)).toBeNull();
	});

	test('refuses a short secret when it is built', () => {
		expect(() => mockAuthMiddleware(user, { secret: 'short' })).toThrow(
			'mockAuthMiddleware(): `secret` must be a string of at least 16 characters — is its environment variable set?',
		);
	});
});

describe('principalFromMockHeaders', () => {
	const trustedGateway = gatewaySecret({ secret: SECRET });

	function app(options: unknown) {
		const hono = new Hono();
		hono.onError((error, ctx) => ctx.text(error.message, 500));
		hono.get('/', async (ctx) =>
			ctx.json((await principalFromMockHeaders(ctx, options as never)) ?? null),
		);
		return hono;
	}

	test('reads the headers of a trusted request', async () => {
		const response = await app({ trustedGateway }).request('/', {
			headers: { [USER_HEADERS.ID]: 'idn-1', [GATEWAY_SECRET_HEADER]: SECRET },
		});
		expect(await response.json()).toMatchObject({ id: 'idn-1' });
	});

	test('ignores forged ones', async () => {
		const response = await app({ trustedGateway }).request('/', {
			headers: { [USER_HEADERS.ID]: 'idn-1' },
		});
		expect(await response.json()).toBeNull();
	});

	test('throws without a trustedGateway', async () => {
		const response = await app(undefined).request('/', {
			headers: { [USER_HEADERS.ID]: 'idn-1' },
		});
		expect(response.status).toBe(500);
		expect(await response.text()).toStartWith(
			'principalFromMockHeaders(): name the gateway allowed to set the caller',
		);
	});
});
