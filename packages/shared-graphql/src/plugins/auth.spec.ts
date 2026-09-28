import { describe, expect, it } from 'bun:test';
import { createSchema, createYoga } from 'graphql-yoga';
import type { GraphQLBaseContext } from '../types';
import { useAuth } from './auth';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from './gateway-trust';

const SECRET = 'a-gateway-secret-of-32-characters';

const yoga = createYoga<object, GraphQLBaseContext>({
	schema: createSchema<GraphQLBaseContext>({
		typeDefs: 'type Query { me: String, token: String }',
		resolvers: {
			Query: {
				me: (_s, _a, ctx) => ctx.user?.sub ?? null,
				token: (_s, _a, ctx) => ctx.token ?? null,
			},
		},
	}),
	plugins: [useAuth({ trustedGateway: gatewaySecret({ secret: SECRET }) })],
});

/** What a client writes: a caller of its choosing in `extensions`. */
const FORGED = {
	query: '{ me token }',
	extensions: { user: { sub: 'idn-admin', uid: 'idn-admin' }, token: 'forged' },
};

async function ask(headers: Record<string, string>, body: object = FORGED) {
	const response = await yoga.fetch('http://api.test/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
	});
	return ((await response.json()) as { data: Record<string, unknown> }).data;
}

describe('useAuth — the caller comes from a trusted gateway only', () => {
	it('ignores a forged extensions.user from a client with no proof', async () => {
		expect(await ask({})).toEqual({ me: null, token: null });
	});

	it('ignores it with a wrong gateway secret', async () => {
		expect(
			await ask({ [GATEWAY_SECRET_HEADER]: 'guessed-secret-value!' }),
		).toEqual({
			me: null,
			token: null,
		});
	});

	it('reads it from the gateway that proves itself', async () => {
		expect(await ask({ [GATEWAY_SECRET_HEADER]: SECRET })).toEqual({
			me: 'idn-admin',
			token: 'forged',
		});
	});

	it('reads no caller from a trusted request whose user is not one', async () => {
		const body = { query: '{ me token }', extensions: { user: { sub: '' } } };
		expect(await ask({ [GATEWAY_SECRET_HEADER]: SECRET }, body)).toEqual({
			me: null,
			token: null,
		});
	});

	it('refuses to be built without a trusted gateway', () => {
		expect(() => useAuth(undefined as never)).toThrow(TypeError);
		expect(() => useAuth({} as never)).toThrow(
			/useAuth\(\): name the gateway allowed to set the caller/,
		);
	});

	it('reads no caller, and does not throw, from a Node upgrade request', async () => {
		const plugin = useAuth({
			trustedGateway: gatewaySecret({ secret: SECRET }),
		});
		const extended: unknown[] = [];
		await plugin.onContextBuilding?.({
			context: {
				request: { headers: { [GATEWAY_SECRET_HEADER]: SECRET } },
				params: FORGED,
			},
			extendContext: (value: unknown) => extended.push(value),
		} as never);
		expect(extended).toEqual([]);
	});
});
