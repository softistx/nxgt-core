import { MapperKind, mapSchema } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import { defaultFieldResolver, GraphQLError } from 'graphql';
import type { PolicyClaims } from '../claims.types';
import type { CompiledPolicy } from '../compile';
import { evaluateGraphql } from './evaluator';

export interface ApplyGraphqlPolicyOptions {
	/**
	 * Extracts the caller's claims from the resolver's GraphQL context.
	 * Required rather than assumed (e.g. `context.claims`) because the
	 * context shape is server-specific (Yoga, Apollo, Mercurius, ...) and
	 * this package doesn't depend on any of them.
	 */
	getClaims: (context: unknown) => PolicyClaims;
}

/**
 * Wraps the resolvers of a `GraphQLSchema` with the authorization rules in
 * `policy.graphql`, producing a new schema — the original is not mutated.
 *
 * For every `typeName.fieldName` that has a rule entry (this covers `Query`/
 * `Mutation`/`Subscription` root fields as well as any other object type
 * declared in the policy, e.g. `User.email`), the field's resolver is
 * replaced with a wrapper that runs the same authorities + expression check
 * as `evaluateGraphql`, then either throws a `GraphQLError` (DENY) or
 * delegates to the original resolver — `defaultFieldResolver` when the field
 * had none (ALLOW). Fields with no rule entry are left completely untouched.
 *
 * Call once at server startup, after building the executable schema and
 * after `compilePolicy(...)`, and serve the returned schema instead of the
 * original.
 */
export function applyGraphqlPolicy(
	schema: GraphQLSchema,
	policy: CompiledPolicy,
	options: ApplyGraphqlPolicyOptions,
): GraphQLSchema {
	if (!policy.graphql) return schema;
	const graphqlPolicy = policy.graphql;

	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			if (!graphqlPolicy[typeName]?.[fieldName]) return fieldConfig;

			const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;

			return {
				...fieldConfig,
				resolve: (source, args, context, info) => {
					const claims = options.getClaims(context);
					const result = evaluateGraphql(policy, {
						type: 'graphql',
						operationType: typeName,
						field: fieldName,
						claims,
						args,
						source,
						info,
					});

					if (result.decision === 'DENY') {
						throw new GraphQLError(result.reason, {
							extensions: { code: 'FORBIDDEN' },
						});
					}

					return originalResolve(source, args, context, info);
				},
			};
		},
	});
}
