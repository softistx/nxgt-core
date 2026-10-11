import { afterEach, describe, expect, test } from 'bun:test';
import type { Ory, OryPrincipal } from '@nxgt/ory-sdk';
import { OryUnavailable } from '@nxgt/ory-sdk';
import { createSchema, createYoga } from 'graphql-yoga';
import { createMaskError } from '../utils/errors/mask-error';
import { resolveOryPrincipal, useOryAuth } from './ory-auth';

const expiry = new Date('2026-09-07T12:00:00.000Z');

const principal: OryPrincipal = {
	subject: 'idn-1',
	kind: 'session',
	identity: {
		email: 'ada@example.test',
		name: { first: 'Ada', last: 'L' },
		verified: true,
	},
	aal: 'aal2',
	scopes: [],
	expiresAt: expiry,
};

/** Only `resolve` is reached here; the rest of `Ory` is not this test's business. */
function stubOry(resolve: Ory['resolve']): Ory {
	return { resolve } as unknown as Ory;
}

describe('resolveOryPrincipal', () => {
	test('puts rules-shaped claims on the context, not the principal', async () => {
		const context = await resolveOryPrincipal(
			stubOry(async () => principal),
			new Headers({ cookie: 'ory_kratos_session=abc' }),
		);

		// The whole point: `claims.aal` and `claims.email_verified` have
		// nowhere to live in a `TokenPrincipal`, so a rule reading `user` as
		// claims could never see them — and a rule that names them guarded a
		// REST route while guarding nothing here.
		expect(context.claims).toEqual({
			sub: 'idn-1',
			kind: 'session',
			email: 'ada@example.test',
			email_verified: true,
			aal: 'aal2',
			exp: Math.floor(expiry.getTime() / 1000),
		});

		// `user` is unchanged — services read it, and it is not claims.
		expect(context.user).toMatchObject({
			sub: 'idn-1',
			uid: 'idn-1',
			authorities: [],
			roles: [],
		});
		expect(context.ory).toBe(principal);
	});

	test('an anonymous caller has no claims at all, not empty ones', async () => {
		const context = await resolveOryPrincipal(
			stubOry(async () => null),
			new Headers(),
		);

		// `{ sub: '' }` would read as a caller to `isAuthenticated`; absent is
		// the honest shape, and `applyGraphqlPolicy` supplies its own default.
		expect(context.claims).toBeUndefined();
		expect(context.user).toBeUndefined();
		expect(context.ory).toBeNull();
	});

	test('an Ory outage is a 503, never an anonymous caller', async () => {
		const failing = stubOry(async () => {
			throw new OryUnavailable('kratos', 0, {});
		});

		await expect(
			resolveOryPrincipal(failing, new Headers()),
		).rejects.toMatchObject({
			extensions: { code: 'SERVICE_UNAVAILABLE', http: { status: 503 } },
		});
	});
});

describe('useOryAuth — an anonymous request clears what the context factory set', () => {
	// Yoga runs the app's context factory BEFORE user plugins, and Envelop
	// merges `extendContext` with `Object.assign`: only an explicit key, even
	// one holding `undefined`, overwrites. An absent key leaves a `user` the
	// factory set standing for a caller who presented no credential.
	test('user, claims and token are own keys holding undefined', async () => {
		let seen: Record<string, unknown> = {};
		const yoga = createYoga<object, never>({
			schema: createSchema<never>({
				typeDefs: 'type Query { ok: Boolean }',
				resolvers: {
					Query: {
						ok: (_s, _a, ctx) => {
							seen = ctx as Record<string, unknown>;
							return true;
						},
					},
				},
			}),
			context: () =>
				({
					user: { sub: 'from-factory' },
					claims: { sub: 'from-factory' },
					token: 'from-factory',
				}) as never,
			plugins: [useOryAuth(stubOry(async () => null)) as never],
		});

		const response = await yoga.fetch('http://api.test/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: '{ ok }' }),
		});
		expect(response.status).toBe(200);

		for (const key of ['user', 'claims', 'token']) {
			expect(seen[key]).toBe(undefined);
			expect(key in seen).toBe(true);
		}
	});
});

describe('useOryAuth — an outage during context building, behind createMaskError', () => {
	const outage = async () => {
		const yoga = createYoga<object, never>({
			schema: createSchema<never>({
				typeDefs: 'type Query { ok: Boolean }',
				resolvers: { Query: { ok: () => true } },
			}),
			maskedErrors: { maskError: createMaskError(), isDev: false },
			logging: false,
			plugins: [
				useOryAuth(
					stubOry(async () => {
						throw new OryUnavailable('keto', 500, 'keto answered 500');
					}),
				) as never,
			],
		});
		const response = await yoga.fetch('http://api.test/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: '{ ok }' }),
		});
		return { status: response.status, text: await response.text() };
	};

	test('answers 503 SERVICE_UNAVAILABLE and leaks no debugMessage', async () => {
		const { status, text } = await outage();
		expect(status).toBe(503);
		expect(text).toContain('SERVICE_UNAVAILABLE');
		expect(text).not.toContain('keto answered 500');
		expect(text).not.toContain('debugMessage');
	});

	describe('debugMessage follows NODE_ENV, and only `development` counts', () => {
		const original = process.env['NODE_ENV'];
		afterEach(() => {
			if (original === undefined) delete process.env['NODE_ENV'];
			else process.env['NODE_ENV'] = original;
		});

		test('development: debugMessage is present', async () => {
			process.env['NODE_ENV'] = 'development';
			const { status, text } = await outage();
			expect(status).toBe(503);
			expect(text).toContain('keto answered 500');
			expect(text).toContain('debugMessage');
		});

		test('production: debugMessage is absent', async () => {
			process.env['NODE_ENV'] = 'production';
			const { text } = await outage();
			expect(text).not.toContain('debugMessage');
		});

		test('unset: debugMessage is absent', async () => {
			delete process.env['NODE_ENV'];
			const { text } = await outage();
			expect(text).not.toContain('debugMessage');
		});

		test('test: debugMessage is absent (a leak, unlike the Sandbox)', async () => {
			process.env['NODE_ENV'] = 'test';
			const { text } = await outage();
			expect(text).not.toContain('debugMessage');
		});
	});
});
