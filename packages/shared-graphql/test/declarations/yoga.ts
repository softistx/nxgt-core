// The Yoga plugins and the Hono mount an app exports, behind exported values
// whose types are inferred: a declaration build must be able to name each one
// through `@nxgt/shared-graphql` and its dependencies alone (TS2883 otherwise).
import type { Ory } from '@nxgt/ory-sdk';
import { gatewaySecret } from '@nxgt/security/gateway';
import {
	createKetoChecks,
	createYogaHono,
	extractJwtPlugin,
	honoYoga,
	useAuth,
	useAuthenticated,
	useKetoChecks,
	useOryAuth,
} from '@nxgt/shared-graphql';
import { createSchema, createYoga } from 'graphql-yoga';

declare const ory: Ory;

export const trustedGateway = gatewaySecret({ secret: 'a-secret-of-16-chars' });

export const oryPlugins = [
	useOryAuth(ory),
	useAuthenticated(),
	useKetoChecks(ory),
];

export const gatewayPlugins = [useAuth({ trustedGateway }), useAuthenticated()];

export const jwt = extractJwtPlugin({ trustedGateway });

export const checks = createKetoChecks(ory);

export const yoga = createYoga({
	schema: createSchema({ typeDefs: 'type Query { ok: Boolean }' }),
	plugins: oryPlugins,
});

export const mount = honoYoga(yoga);

export const app = createYogaHono(yoga, { sandbox: { endpoint: 'explore' } });
