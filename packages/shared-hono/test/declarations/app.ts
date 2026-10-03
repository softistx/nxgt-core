// Every middleware an app is made of, behind exported values whose types are
// inferred: a declaration build must be able to name each one through
// `@nxgt/shared-hono` and its peers alone (TS2883 otherwise).
import { translate } from '@nxgt/i18n';
import type { Ory, PermissionRequirement } from '@nxgt/ory-sdk';
import {
	acceptQuery,
	createErrorHandler,
	currentUser,
	gatewaySecret,
	ketoCheck,
	openfetchServiceUser,
	oryAuth,
	oryChecks,
	rateLimiter,
	requireAuthenticated,
	secured,
	withOryUnavailable,
} from '@nxgt/shared-hono';
import { createMcpServerApp, McpServer } from '@nxgt/shared-hono/mcp';
import createClient from '@nxgt/shared-hono/openapi-fetch';
import { Hono } from 'hono';

declare const ory: Ory;

const view = (): PermissionRequirement => [
	[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
];

export const trustedGateway = gatewaySecret({ secret: 'a-secret-of-16-chars' });

export const limiter = rateLimiter({ limit: 10 });

export const app = new Hono()
	.use('/api/*', currentUser({ trustedGateway }))
	.use('*', oryAuth(ory), oryChecks(ory))
	.use('/api/*', requireAuthenticated())
	.get('/api/users', secured([['ADMIN'], ['users:read']]), (c) =>
		c.json({ users: [] }),
	)
	.get('/bookmarks/:id', ketoCheck(view()), (c) =>
		c.json({ id: c.req.param('id') }),
	)
	.post('/bookmarks/search', acceptQuery(), (c) => c.json([]));

app.onError(withOryUnavailable(createErrorHandler(translate)));

export const errors = createErrorHandler(translate, { logToConsole: false });

export const keto = ketoCheck(view(), { onDeny: 'FORBIDDEN' });

export const forward = openfetchServiceUser({
	secret: 'a-secret-of-16-chars',
});

type Paths = {
	'/users/{id}': {
		get: {
			parameters: { path: { id: string } };
			responses: {
				200: { content: { 'application/json': { id: string } } };
			};
		};
	};
};

export const rest = createClient<Paths>({ baseUrl: 'https://api.example.com' });

export function user(id: string) {
	return rest.GET('/users/{id}', { params: { path: { id } } });
}

export const mcp = createMcpServerApp(
	new McpServer({ name: 'fixture', version: '0.0.0' }),
);
