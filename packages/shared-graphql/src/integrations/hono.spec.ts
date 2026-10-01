import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import * as integrations from './hono';

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
