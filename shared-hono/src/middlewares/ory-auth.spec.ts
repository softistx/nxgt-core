import { describe, expect, test } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createOry, OryUnavailable } from 'stx-sdk/ory';
import { createErrorHandler } from './error-handler';
import { oryAuth, toPrincipal, withOryUnavailable } from './ory-auth';

/**
 * Against a stubbed Ory — the mapping from `createOry`'s three answers
 * (principal, null, OryUnavailable) to what a route sees is the contract
 * here; `stx-sdk/ory` has its own tests against the real stack.
 *
 * `bun test` sets NODE_ENV=test, which is what lets the mock-header branch
 * be exercised alongside the real one.
 */

type Reply = { status: number; body?: unknown } | Error;

function stack(
	replies: Record<string, Reply>,
	edge?: { issuer: string; jwksUrl?: string },
) {
	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const path = new URL(new Request(input, init).url).pathname;
		const reply = replies[path];
		if (!reply) throw new Error(`no fixed reply for ${path}`);
		if (reply instanceof Error) throw reply;
		return new Response(
			reply.body === undefined ? null : JSON.stringify(reply.body),
			{ status: reply.status, headers: { 'content-type': 'application/json' } },
		);
	};
	return createOry({
		kratosPublicUrl: 'http://kratos.test:4433',
		ketoReadUrl: 'http://keto.test:4466',
		hydraAdminUrl: 'http://hydra.test:4445',
		edge,
		fetch: fetch as typeof globalThis.fetch,
	});
}

const session = {
	id: 'sess-1',
	active: true,
	authenticator_assurance_level: 'aal1',
	identity: {
		id: 'idn-1',
		schema_id: 'user',
		schema_url: '',
		traits: { email: 'ada@example.test', name: { first: 'Ada', last: 'L' } },
		verifiable_addresses: [
			{ id: 'v', value: 'ada@example.test', verified: true, via: 'email' },
		],
	},
};

/**
 * The edge half. A keypair generated here, so these tests need no Oathkeeper —
 * `stx-sdk/ory` verifies the same tokens against a live one.
 */
const EDGE_ISSUER = 'http://oathkeeper.test:4456/';
const EDGE_JWKS = 'http://oathkeeper.test:4456/.well-known/jwks.json';

const edgeKeys = await generateKeyPair('RS256', { extractable: true });
const otherKeys = await generateKeyPair('RS256', { extractable: true });
const edgeJwks = {
	keys: [
		{ ...(await exportJWK(edgeKeys.publicKey)), alg: 'RS256', kid: 'edge' },
	],
};

/** The claims nxgt-ory's `config/oathkeeper.yaml` is configured to sign. */
function edgeToken(
	claims: Record<string, unknown>,
	key = edgeKeys.privateKey,
): Promise<string> {
	return new SignJWT(claims)
		.setProtectedHeader({ alg: 'RS256', kid: 'edge' })
		.setIssuer(EDGE_ISSUER)
		.setIssuedAt()
		.setExpirationTime('1m')
		.sign(key);
}

function edgeApp(replies: Record<string, Reply>) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	// The edge is configured on `createOry`, not on the middleware: `oryAuth`
	// is unchanged by any of this, which is the point.
	hono.use(
		'*',
		oryAuth(
			stack(
				{
					'/.well-known/jwks.json': { status: 200, body: edgeJwks },
					...replies,
				},
				{ issuer: EDGE_ISSUER, jwksUrl: EDGE_JWKS },
			),
		),
	);
	hono.get('/me', (ctx) =>
		ctx.json({
			principal: ctx.get('principal') ?? null,
			ory: ctx.get('ory') ?? null,
			claims: ctx.get(USER_HEADERS.CLAIMS) ?? null,
		}),
	);
	return hono;
}

function app(replies: Record<string, Reply>) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	hono.use('*', oryAuth(stack(replies)));
	hono.get('/me', (ctx) =>
		ctx.json({
			principal: ctx.get('principal') ?? null,
			ory: ctx.get('ory') ?? null,
			accessToken: ctx.get('accessToken') ?? null,
			claims: ctx.get(USER_HEADERS.CLAIMS) ?? null,
		}),
	);
	return hono;
}

describe('oryAuth', () => {
	test('a Kratos cookie becomes a session principal', async () => {
		const response = await app({
			'/sessions/whoami': { status: 200, body: session },
		}).request('/me', { headers: { cookie: 'ory_kratos_session=abc' } });

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.principal).toMatchObject({
			id: 'idn-1',
			email: 'ada@example.test',
			username: 'ada@example.test',
			name: 'ada@example.test',
			firstName: 'Ada',
			lastName: 'L',
			authorities: [],
			roles: [],
			scopes: [],
		});
		expect(body.ory).toMatchObject({ subject: 'idn-1', kind: 'session' });
		expect(body.accessToken).toBeNull();
		expect(body.claims).toMatchObject({
			sub: 'idn-1',
			kind: 'session',
			email_verified: true,
		});
	});

	test('a Bearer token becomes a token principal and is kept as accessToken', async () => {
		const response = await app({
			'/admin/oauth2/introspect': {
				status: 200,
				body: {
					active: true,
					sub: 'idn-1',
					client_id: 'app',
					scope: 'openid email',
				},
			},
		}).request('/me', { headers: { authorization: 'Bearer tok' } });

		const body = await response.json();
		expect(body.principal).toMatchObject({
			id: 'idn-1',
			clientId: 'app',
			scopes: ['openid', 'email'],
		});
		expect(body.ory).toMatchObject({ subject: 'idn-1', kind: 'token' });
		expect(body.accessToken).toBe('tok');
	});

	test('no credential is an anonymous caller, not an error', async () => {
		const response = await app({}).request('/me');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.principal).toBeNull();
		expect(body.ory).toBeNull();
	});

	test('a credential Ory does not honour is anonymous too', async () => {
		const response = await app({
			'/sessions/whoami': { status: 401, body: { error: {} } },
		}).request('/me', { headers: { cookie: 'ory_kratos_session=stale' } });
		expect(response.status).toBe(200);
		expect((await response.json()).principal).toBeNull();
	});

	test('an unreachable Ory is a 503, never an anonymous next()', async () => {
		for (const reply of [
			{ status: 502, body: {} },
			new TypeError('fetch failed'),
		]) {
			const response = await app({ '/sessions/whoami': reply }).request('/me', {
				headers: { cookie: 'ory_kratos_session=abc' },
			});
			expect(
				response.status,
				JSON.stringify(await response.clone().json()),
			).toBe(503);
			expect((await response.json()).message).toBe(
				'errors.service-unavailable',
			);
		}
	});

	test('mock X-User-* headers short-circuit in NODE_ENV=test, with an Ory principal to match', async () => {
		const response = await app({}).request('/me', {
			headers: {
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

describe('withOryUnavailable', () => {
	test('turns an OryUnavailable thrown below the middleware into a 503', async () => {
		const hono = new Hono();
		hono.onError(
			withOryUnavailable(
				createErrorHandler((key) => key, { logToConsole: false }),
			),
		);
		hono.get('/keto-down', () => {
			throw new OryUnavailable('keto', 0, new TypeError('fetch failed'));
		});
		hono.get('/other', () => {
			throw new Error('unrelated');
		});

		const down = await hono.request('/keto-down');
		expect(down.status).toBe(503);
		expect((await down.json()).message).toBe('errors.service-unavailable');

		expect((await hono.request('/other')).status).toBe(500);
	});
});

describe('oryAuth behind Oathkeeper', () => {
	test('an edge token becomes a session principal, without asking Kratos or Hydra', async () => {
		// No `/sessions/whoami` and no `/admin/oauth2/introspect` reply is
		// registered: the stub throws if either is called, so this test fails
		// loudly if the edge branch is skipped.
		const token = await edgeToken({
			sub: 'idn-1',
			email: 'ada@example.test',
			email_verified: true,
			aal: 'aal1',
			scope: '',
			client_id: '',
		});

		const response = await edgeApp({}).request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.ory).toMatchObject({ subject: 'idn-1', kind: 'session' });
		expect(body.principal).toMatchObject({
			id: 'idn-1',
			email: 'ada@example.test',
			authorities: [],
			roles: [],
		});
		expect(body.claims).toMatchObject({
			sub: 'idn-1',
			kind: 'session',
			email_verified: true,
		});
	});

	test('an edge token carrying a client id is a token principal', async () => {
		const token = await edgeToken({
			sub: 'client-1',
			client_id: 'client-1',
			scope: 'openid',
			email: '',
		});

		const body = await (
			await edgeApp({}).request('/me', {
				headers: { authorization: `Bearer ${token}` },
			})
		).json();

		expect(body.ory).toMatchObject({
			subject: 'client-1',
			kind: 'token',
			clientId: 'client-1',
		});
	});

	test('a forged edge token is anonymous — and is never retried against Hydra', async () => {
		const forged = await edgeToken({ sub: 'idn-1' }, otherKeys.privateKey);

		// Again: no introspection reply is registered, so a fallback would
		// throw rather than quietly succeed.
		const response = await edgeApp({}).request('/me', {
			headers: { authorization: `Bearer ${forged}` },
		});

		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.principal).toBeNull();
		expect(body.ory).toBeNull();
	});

	test('a cookie still reaches Kratos when the edge is configured but unused', async () => {
		const body = await (
			await edgeApp({
				'/sessions/whoami': { status: 200, body: session },
			}).request('/me', { headers: { cookie: 'ory_kratos_session=abc' } })
		).json();

		expect(body.ory).toMatchObject({ subject: 'idn-1', kind: 'session' });
	});

	test('an unreachable JWKS is a 503, never an anonymous caller', async () => {
		const token = await edgeToken({ sub: 'idn-1' });

		const response = await edgeApp({
			'/.well-known/jwks.json': new Error('ECONNREFUSED'),
		}).request('/me', { headers: { authorization: `Bearer ${token}` } });

		expect(response.status).toBe(503);
	});
});

describe('toPrincipal', () => {
	test('a client_credentials token has a client id for a name and no identity', () => {
		const principal = toPrincipal({
			subject: 'app',
			kind: 'token',
			scopes: ['read'],
			clientId: 'app',
		});
		expect(principal).toMatchObject({
			id: 'app',
			name: 'app',
			clientId: 'app',
			email: null,
			authorities: [],
		});
	});
});
