import { describe, expect, test } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { createOry } from 'stx-sdk/ory';
import { createErrorHandler } from './error-handler';
import { oryAuth, toPrincipal } from './ory-auth';

/**
 * Against a stubbed Ory — the mapping from `createOry`'s three answers
 * (principal, null, OryUnavailable) to what a route sees is the contract
 * here; `stx-sdk/ory` has its own tests against the real stack.
 *
 * `bun test` sets NODE_ENV=test, which is what lets the mock-header branch
 * be exercised alongside the real one.
 */

type Reply = { status: number; body?: unknown } | Error;

function stack(replies: Record<string, Reply>) {
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
