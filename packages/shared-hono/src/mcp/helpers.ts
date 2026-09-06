import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import {
	type McpServer,
	WebStandardStreamableHTTPServerTransport,
	type WebStandardStreamableHTTPServerTransportOptions,
} from '@modelcontextprotocol/server';
import type { Context } from 'hono';

import { createAuthClient } from 'stx-sdk/auth';

// Not exported: nothing outside this module used it, and its inferred type
// reaches openapi-fetch through stx-sdk's own node_modules — a path that does
// not exist for anyone installing this package, which `tsc` refuses to write
// into a declaration (TS2883).
//
// The base URL is hardcoded, which is wrong for a shared package; left as it
// was rather than changed silently during the merge.
const auth = createAuthClient('http://localhost:8080/api');

export function createMcpServerApp(
	server: McpServer,
	options?: WebStandardStreamableHTTPServerTransportOptions,
) {
	const app = createMcpHonoApp();

	const transport = new WebStandardStreamableHTTPServerTransport({
		...options,
		sessionIdGenerator:
			options?.sessionIdGenerator || (() => Bun.randomUUIDv7()),
	});

	app.all('/mcp', async (c) => {
		if (!server.isConnected()) {
			await server.connect(transport);
		}

		const authHeader = c.req.header('Authorization');

		const result = await auth.POST('/oauth/introspect', {
			body: { token: authHeader?.split(' ')[1] ?? '' },
		});

		if (!result.data?.active) {
			c.status(401);
			return c.json({ error: 'MCP Unauthorized' });
		}

		return transport.handleRequest(c.req.raw, {
			authInfo: {
				scopes: result.data.scope?.split(' ') ?? [],
				clientId: result.data.clientId ?? '',
				token: authHeader?.split(' ')[1] ?? '',
				extra: result.data,
			},
			parsedBody: (c as Context).get('parsedBody'),
		});
	});
	return app;
}

export * from '@modelcontextprotocol/hono';
export * from '@modelcontextprotocol/server';
