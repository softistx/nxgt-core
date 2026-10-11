import { afterEach, describe, expect, it } from 'bun:test';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { createSchema, createYoga } from 'graphql-yoga';
import { Hono } from 'hono';
import { createMaskError } from '../utils/errors/mask-error';
import * as integrations from './hono';
import { createYogaHono, honoYoga } from './hono';

describe('sandboxExplorer', () => {
	it('serves Apollo Sandbox, under its corrected name alone', async () => {
		const app = new Hono().get(
			'/sandbox',
			integrations.sandboxExplorer({ port: 4000 }),
		);
		const page = await (await app.request('/sandbox')).text();
		expect(page).toContain('http://localhost:4000/graphql');
		expect('sandboxExpolorer' in integrations).toBe(false);
	});

	it('starts at the server that served it, when nothing pins it', async () => {
		const app = new Hono().get(
			'/sandbox',
			integrations.sandboxExplorer({ graphqlEndpoint: '/api/graphql' }),
		);
		const page = await (
			await app.request('https://shop.example.com/sandbox')
		).text();
		expect(page).toContain(
			'initialEndpoint: "https://shop.example.com/api/graphql"',
		);
		expect(page).not.toContain('localhost:8080');
	});

	it('keeps a pinned port, and a whole initialEndpoint', async () => {
		const pinned = new Hono().get(
			'/sandbox',
			integrations.sandboxExplorer({
				initialEndpoint: 'https://api.example.com/gql',
			}),
		);
		expect(await (await pinned.request('/sandbox')).text()).toContain(
			'initialEndpoint: "https://api.example.com/gql"',
		);
	});
});

/** A Yoga server whose resolvers answer, refuse and fail, masked as an app masks them. */
const yoga = (isDev = false) =>
	createYoga({
		schema: createSchema({
			typeDefs: 'type Query { hello: String, missing: String, broken: String }',
			resolvers: {
				Query: {
					hello: () => 'world',
					missing: () => {
						throw CustomException.notFound({
							message: 'errors.not-found',
							debugMessage: 'note 42 is not in the collection',
						});
					},
					broken: () => {
						throw new Error('an internal detail');
					},
				},
			},
		}),
		maskedErrors: { maskError: createMaskError(), isDev },
	});

const post = (app: Hono, query: string, headers: Record<string, string> = {}) =>
	app.request('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ query }),
	});

const initialNodeEnv = process.env['NODE_ENV'];
const runningIn = (environment: string) => {
	process.env['NODE_ENV'] = environment;
};
afterEach(() => {
	if (initialNodeEnv === undefined) delete process.env['NODE_ENV'];
	else process.env['NODE_ENV'] = initialNodeEnv;
});

describe('createYogaHono', () => {
	it('answers a GraphQL POST', async () => {
		const response = await post(createYogaHono(yoga()), '{ hello }');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { hello: 'world' } });
	});

	it('answers /health', async () => {
		const response = await createYogaHono(yoga()).request('/health');
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	describe('the Sandbox page', () => {
		it.each(['development', 'test'])(
			'is served by default in %s, starting at the request origin',
			async (environment) => {
				runningIn(environment);
				const response = await createYogaHono(yoga()).request(
					'https://api.example.com/sandbox',
				);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain(
					'initialEndpoint: "https://api.example.com/graphql"',
				);
			},
		);

		it('is not served by default in production', async () => {
			runningIn('production');
			const response = await createYogaHono(yoga()).request('/sandbox');
			expect(response.status).toBe(404);
		});

		it('is served in production with sandbox: true', async () => {
			runningIn('production');
			const response = await createYogaHono(yoga(), {
				sandbox: true,
			}).request('/sandbox');
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('EmbeddedSandbox');
		});

		it('is not served in development with sandbox: false', async () => {
			runningIn('development');
			const response = await createYogaHono(yoga(), {
				sandbox: false,
			}).request('/sandbox');
			expect(response.status).toBe(404);
		});

		it('takes its page options in development', async () => {
			runningIn('development');
			const app = createYogaHono(yoga(), {
				sandbox: { endpoint: 'explore', port: 4000 },
			});
			const response = await app.request('/explore');
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('http://localhost:4000/graphql');
			expect((await app.request('/sandbox')).status).toBe(404);
		});

		it('is not served in production when given page options alone', async () => {
			runningIn('production');
			const app = createYogaHono(yoga(), { sandbox: { port: 4000 } });
			expect((await app.request('/sandbox')).status).toBe(404);
		});

		it('is served in production with page options and enabled: true', async () => {
			runningIn('production');
			const app = createYogaHono(yoga(), {
				sandbox: { endpoint: 'explore', enabled: true },
			});
			expect((await app.request('/explore')).status).toBe(200);
		});

		it('is not served in development with enabled: false', async () => {
			runningIn('development');
			const app = createYogaHono(yoga(), {
				sandbox: { port: 4000, enabled: false },
			});
			expect((await app.request('/sandbox')).status).toBe(404);
		});

		it('leaves the GraphQL POST alone when it is off', async () => {
			runningIn('production');
			const response = await post(createYogaHono(yoga()), '{ hello }');
			expect(await response.json()).toEqual({ data: { hello: 'world' } });
		});
	});

	describe('errors', () => {
		it('answers an exception with its code, status and translated message', async () => {
			const response = await post(createYogaHono(yoga()), '{ missing }');
			expect(response.status).toBe(404);
			const body = await response.json();
			expect(body.errors[0]).toMatchObject({
				message: 'Could not find the requested resource.',
				extensions: { code: ErrorCode.NotFound },
			});
		});

		it('translates in the Accept-Language of the request', async () => {
			const response = await post(createYogaHono(yoga()), '{ missing }', {
				'accept-language': 'fr',
			});
			const body = await response.json();
			expect(body.errors[0].message).toBe(
				'Impossible de trouver la ressource demandée.',
			);
		});

		it('answers an unexpected error with the generic message', async () => {
			const response = await post(createYogaHono(yoga()), '{ broken }');
			const body = await response.json();
			expect(body.errors[0]).toEqual({
				message: 'Unexpected error.',
				locations: [{ line: 1, column: 3 }],
				path: ['broken'],
				extensions: { code: ErrorCode.InternalServerError },
			});
		});

		it('carries the original in debugMessage when isDev is on', async () => {
			const response = await post(createYogaHono(yoga(true)), '{ broken }');
			const body = await response.json();
			expect(body.errors[0].extensions.debugMessage).toContain(
				'an internal detail',
			);
		});
	});
});

describe('honoYoga', () => {
	it('mounts Yoga on any Hono route', async () => {
		const server = yoga();
		const app = new Hono().use(server.graphqlEndpoint, honoYoga(server));
		const response = await post(app, '{ hello }');
		expect(await response.json()).toEqual({ data: { hello: 'world' } });
	});
});
