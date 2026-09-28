import { describe, expect, test } from 'bun:test';
import type { GatewaySecretOptions } from '@nxgt/security/gateway';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { currentUser } from './current-user';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from './gateway-trust';
import { openfetchServiceUser } from './openfetch-service-user';

const SECRET = 'a-gateway-secret-of-32-characters';

/** The headers a REST call made inside a request would carry. */
function app(gateway?: GatewaySecretOptions) {
	const hono = new Hono();
	hono.use('*', contextStorage());
	hono.use(
		'*',
		currentUser({ trustedGateway: gatewaySecret({ secret: SECRET }) }),
	);
	hono.get('/', async (ctx) => {
		const request = new Request('http://service.test/me');
		const result = await openfetchServiceUser(gateway).onRequest?.({
			request,
		} as never);
		const headers = (result instanceof Request ? result : request).headers;
		return ctx.json(Object.fromEntries(headers));
	});
	return hono;
}

const trusted = { [USER_HEADERS.ID]: 'idn-1', [GATEWAY_SECRET_HEADER]: SECRET };

describe('openfetchServiceUser', () => {
	test('forwards the caller with the gateway secret it is given', async () => {
		const response = await app({ secret: SECRET }).request('/', {
			headers: trusted,
		});
		const headers = await response.json();
		expect(headers[USER_HEADERS.ID.toLowerCase()]).toBe('idn-1');
		expect(headers[GATEWAY_SECRET_HEADER]).toBe(SECRET);
	});

	test('forwards no proof without one', async () => {
		const response = await app().request('/', { headers: trusted });
		const headers = await response.json();
		expect(headers[USER_HEADERS.ID.toLowerCase()]).toBe('idn-1');
		expect(headers[GATEWAY_SECRET_HEADER]).toBeUndefined();
	});

	test('forwards nothing for a forged caller', async () => {
		const response = await app({ secret: SECRET }).request('/', {
			headers: { [USER_HEADERS.ID]: 'idn-1' },
		});
		expect(await response.json()).toEqual({});
	});

	test('refuses a short secret when it is built', () => {
		expect(() => openfetchServiceUser({ secret: '' })).toThrow(
			/^openfetchServiceUser\(\): `secret` must be/,
		);
	});
});
