import { describe, expect, it } from 'bun:test';
import { ApolloServer, HeaderMap } from '@apollo/server';
import { extractJwtPlugin, type JwtContext } from './extract-jwt';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from './gateway-trust';

const SECRET = 'a-gateway-secret-of-32-characters';

const server = new ApolloServer<JwtContext>({
	typeDefs: 'type Query { me: String }',
	resolvers: {
		Query: {
			me: (_s: unknown, _a: unknown, ctx: JwtContext) =>
				ctx.jwt?.payload.sub ?? null,
		},
	},
	plugins: [
		extractJwtPlugin({ trustedGateway: gatewaySecret({ secret: SECRET }) }),
	],
});

/** A request whose body claims a caller, sent with `headers`. */
async function me(headers: Record<string, string>): Promise<unknown> {
	const map = new HeaderMap();
	for (const [name, value] of Object.entries(headers)) map.set(name, value);
	const response = await server.executeOperation(
		{
			query: '{ me }',
			extensions: { payload: { sub: 'idn-admin' } },
			http: { method: 'POST', headers: map, search: '', body: {} },
		},
		{ contextValue: {} },
	);
	if (response.body.kind !== 'single') throw new Error('expected one result');
	return response.body.singleResult.data?.me;
}

describe('extractJwtPlugin — the payload comes from a trusted gateway only', () => {
	it('ignores a forged extensions.payload from a client with no proof', async () => {
		expect(await me({})).toBeNull();
		expect(
			await me({ [GATEWAY_SECRET_HEADER]: 'guessed-secret-value!' }),
		).toBeNull();
	});

	it('reads it from the gateway that proves itself', async () => {
		expect(await me({ [GATEWAY_SECRET_HEADER]: SECRET })).toBe('idn-admin');
	});

	it('refuses to be built without a trusted gateway', () => {
		expect(() => extractJwtPlugin({} as never)).toThrow(
			/extractJwtPlugin\(\): name the gateway allowed to set the caller/,
		);
	});
});
