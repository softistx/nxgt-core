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
});
