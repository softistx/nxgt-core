import { describe, expect, it } from 'bun:test';
import { version } from 'graphql';
import { extractJwtPlugin, type JwtContext } from './extract-jwt';
import { GATEWAY_SECRET_HEADER, gatewaySecret } from './gateway-trust';

/**
 * Apollo Server 5 peers graphql ^16 and `require()`s it, which graphql 17 —
 * ESM only — refuses. So the Apollo cases run on graphql 16 and are skipped
 * by `test:graphql17`, where Apollo cannot load at all.
 */
const ON_APOLLO = version.startsWith('16.');
const apollo = ON_APOLLO
	? await import('@apollo/server')
	: ({} as typeof import('@apollo/server'));

const SECRET = 'a-gateway-secret-of-32-characters';

const server =
	ON_APOLLO &&
	new apollo.ApolloServer<JwtContext>({
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
	const map = new apollo.HeaderMap();
	for (const [name, value] of Object.entries(headers)) map.set(name, value);
	if (!server) throw new Error('Apollo Server needs graphql 16');
	const response = await server.executeOperation(
		{
			query: '{ me }',
			extensions: { payload: { sub: 'idn-admin' } },
			http: { method: 'POST', headers: map, search: '', body: {} },
		},
		{ contextValue: {} },
	);
	if (response.body.kind !== 'single') throw new Error('expected one result');
	return response.body.singleResult.data?.['me'];
}

describe.skipIf(!ON_APOLLO)(
	'extractJwtPlugin — the payload comes from a trusted gateway only',
	() => {
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
	},
);
