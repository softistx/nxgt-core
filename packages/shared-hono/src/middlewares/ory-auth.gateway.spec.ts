import { describe, expect, test } from 'bun:test';
import { createOry } from '@nxgt/ory-sdk';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { createErrorHandler } from './error-handler';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from './gateway-trust';
import { type OryAuthOptions, oryAuth } from './ory-auth';

/**
 * `oryAuth`'s one path that reads the `X-User-*` headers — a route spec's
 * mock caller — and the forged headers it must not read. `bun test` sets
 * NODE_ENV=test, which is the first of its two gates; `trustedGateway` is
 * the second.
 */

const SECRET = 'a-gateway-secret-of-32-characters';

/** An Ory whose Kratos refuses every session: a forged cookie is nobody. */
const ory = createOry({
	kratosPublicUrl: 'http://kratos.test:4433',
	ketoReadUrl: 'http://keto.test:4466',
	hydraAdminUrl: 'http://hydra.test:4445',
	fetch: (async () =>
		new Response('{"error":{}}', {
			status: 401,
			headers: { 'content-type': 'application/json' },
		})) as unknown as typeof globalThis.fetch,
});

function app(options?: OryAuthOptions) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	hono.use('*', oryAuth(ory, options));
	hono.get('/me', (ctx) =>
		ctx.json({
			principal: ctx.get('principal') ?? null,
			ory: ctx.get('ory') ?? null,
			claims: ctx.get(USER_HEADERS.CLAIMS) ?? null,
		}),
	);
	return hono;
}

const trustedGateway = gatewaySecret({ secret: SECRET });

describe('oryAuth — a mock caller', () => {
	test('short-circuits in NODE_ENV=test with the gateway secret, with an Ory principal to match', async () => {
		const response = await app({ trustedGateway }).request('/me', {
			headers: {
				[GATEWAY_SECRET_HEADER]: SECRET,
				[USER_HEADERS.ID]: 'mock-1',
				[USER_HEADERS.EMAIL]: 'mock@example.test',
				[USER_HEADERS.FIRST_NAME]: 'Mo',
			},
		});
		const body = await response.json();
		expect(body.principal).toMatchObject({
			id: 'mock-1',
			email: 'mock@example.test',
		});
		expect(body.ory).toMatchObject({
			subject: 'mock-1',
			kind: 'session',
			identity: { email: 'mock@example.test', verified: true },
		});
		expect(body.claims).toMatchObject({ sub: 'mock-1' });
	});
});

describe('oryAuth — forged X-User-* headers', () => {
	const forged = {
		[USER_HEADERS.ID]: 'someone-else',
		[USER_HEADERS.ROLES]: 'ADMIN',
	};
	const nobody = { principal: null, ory: null, claims: null };

	test('are never read without a trustedGateway, even in NODE_ENV=test', async () => {
		const response = await app().request('/me', { headers: forged });
		expect(await response.json()).toEqual(nobody);
	});

	test.each([
		['no gateway secret', {}],
		['a wrong gateway secret', { [GATEWAY_SECRET_HEADER]: 'guess' }],
	])('are not read with %s', async (_, proof) => {
		const response = await app({ trustedGateway }).request('/me', {
			headers: { ...forged, ...proof },
		});
		expect(await response.json()).toEqual(nobody);
	});

	test('do not stand in for a credential Ory refuses', async () => {
		const response = await app({ trustedGateway }).request('/me', {
			headers: { ...forged, cookie: 'ory_kratos_session=stale' },
		});
		expect(await response.json()).toEqual(nobody);
	});

	test('a trustedGateway that is not a function throws at setup', () => {
		expect(() => oryAuth(ory, { trustedGateway: 'secret' as never })).toThrow(
			'oryAuth(): `trustedGateway` must be a function — gatewaySecret({ secret }), say',
		);
	});
});
