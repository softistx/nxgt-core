import type { Plugin } from 'graphql-yoga';
import type { AuthenticatedOptions } from '../directives/authenticated';
import type { GraphQLBaseContext } from '../types';
import { applyAuthenticated } from './apply-authenticated';
import type { OryContext } from './ory-auth';

/**
 * Enforces `@authenticated` and `@authenticated(type:)` on every schema the
 * server uses. Goes after the plugin that sets the caller — `useOryAuth(ory)`
 * or `useAuth({ trustedGateway })`.
 *
 * `applyAuthenticated` returns a schema with no field left to guard as it is,
 * so the replacement settles alongside `useKetoChecks` whatever their order.
 */
export function useAuthenticated(
	options: AuthenticatedOptions = {},
): Plugin<GraphQLBaseContext & OryContext> {
	return {
		onSchemaChange: ({ schema, replaceSchema }) => {
			const next = applyAuthenticated(schema, options);
			if (next !== schema) replaceSchema(next);
		},
	};
}
