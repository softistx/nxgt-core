import { MapperKind, mapSchema } from '@graphql-tools/utils';
import type { GraphQLSchema } from 'graphql';
import { defaultFieldResolver, GraphQLError, isNonNullType } from 'graphql';
import type { PolicyClaims } from '../claims.types';
import { parseRules } from '../load-rules';
import type { PermissionEvaluator, PolicySubject } from '../permissions.types';
import { evaluateGraphql } from './evaluator';

export interface ApplyGraphqlPolicyOptions {
	/**
	 * Extracts the caller's claims from the resolver's GraphQL context.
	 * Required rather than assumed (e.g. `context.claims`) because the
	 * context shape is server-specific (Yoga, Apollo, Mercurius, ...) and
	 * this package doesn't depend on any of them.
	 */
	getClaims: (context: unknown) => PolicyClaims;

	/**
	 * Supplies the caller and the Keto evaluator for fields whose rule carries
	 * `keto`. Use `ketoPermissions()` from
	 * `@nxgt/security/integrations/graphql/keto`, on a server whose context
	 * carries what `useOryAuth(ory)` and `useKetoChecks(ory)` publish. Rules
	 * with no `keto` term need nothing.
	 *
	 * Declared structurally rather than imported from that module, because it
	 * imports `stx-sdk` and this file must not — a server whose rules ask Keto
	 * nothing should never resolve it.
	 */
	permissions?: (context: unknown) => {
		subject: PolicySubject | null | undefined;
		evaluatePermissions: PermissionEvaluator;
	};

	/**
	 * When a rule targets a field whose GraphQL type is non-null, a DENY on
	 * that field can't just null the field itself — per the GraphQL spec, a
	 * resolver error on a non-null field propagates to the nearest nullable
	 * ancestor, which can wipe out unrelated sibling data (or the entire
	 * response) instead of just hiding the denied field. Defaults to `true`:
	 * `applyGraphqlPolicy` throws at wrap time (schema/server startup) for
	 * any such field, forcing a conscious choice — mark the field nullable,
	 * or pass `strict: false` to acknowledge the cascade and proceed anyway.
	 */
	strict?: boolean;
}

export class NonNullRuleFieldError extends Error {
	constructor(typeName: string, fieldName: string) {
		super(
			`applyGraphqlPolicy: rule targets ${typeName}.${fieldName}, which is ` +
				'a non-null field. A DENY on a non-null field propagates to the ' +
				'nearest nullable ancestor per the GraphQL spec, which can null out ' +
				'unrelated sibling data instead of just this field. Mark the field ' +
				'nullable in the schema, or pass `strict: false` to ' +
				'applyGraphqlPolicy to acknowledge the cascade and proceed anyway.',
		);
		this.name = 'NonNullRuleFieldError';
	}
}

/**
 * Wraps the resolvers of a `GraphQLSchema` with the authorization rules in
 * `policy.graphql`, producing a new schema — the original is not mutated.
 *
 * For every `typeName.fieldName` that has a rule entry (this covers `Query`/
 * `Mutation`/`Subscription` root fields as well as any other object type
 * declared in the policy, e.g. `User.email`), the field's resolver is
 * replaced with a wrapper that runs the same checks as `evaluateGraphql` —
 * authentication floor, authorities, expression, then any `keto` rungs — and
 * either throws a `GraphQLError` or delegates to the original resolver
 * (`defaultFieldResolver` when the field had none). Fields with no rule entry
 * are left completely untouched.
 *
 * The error carries the code the refusal earned: `UNAUTHENTICATED` for a
 * caller the floor turned away, `NOT_FOUND` for a Keto rung declaring it, and
 * `FORBIDDEN` otherwise. Its message is the rule's i18n key when it named one
 * — the same keys `@check` uses, so a field guarded here and a field guarded
 * by the directive refuse in the same words.
 *
 * By default (`strict: true`), throws `NonNullRuleFieldError` at wrap time
 * for any rule-covered field whose GraphQL type is non-null — see
 * `ApplyGraphqlPolicyOptions.strict`.
 *
 * `rawRules` is a raw/unvalidated rules document (e.g. a static YAML import,
 * or `loadRawRulesFromEnv`'s output) — validated and compiled internally via
 * `parseRules`, once, when `applyGraphqlPolicy(...)` is called, not per
 * request.
 *
 * Call once at server startup, after building the executable schema, and
 * serve the returned schema instead of the original.
 */
export function applyGraphqlPolicy(
	schema: GraphQLSchema,
	rawRules: unknown,
	options: ApplyGraphqlPolicyOptions,
): GraphQLSchema {
	const compiledPolicy = parseRules(rawRules);
	if (!compiledPolicy.graphql) return schema;
	const graphqlPolicy = compiledPolicy.graphql;

	return mapSchema(schema, {
		[MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
			if (!graphqlPolicy[typeName]?.[fieldName]) return fieldConfig;

			if ((options.strict ?? true) && isNonNullType(fieldConfig.type)) {
				throw new NonNullRuleFieldError(typeName, fieldName);
			}

			const originalResolve = fieldConfig.resolve ?? defaultFieldResolver;

			return {
				...fieldConfig,
				resolve: async (source, args, context, info) => {
					const claims = options.getClaims(context);
					// Per request, because both halves are: the subject is this
					// caller, and the evaluator closes over this request's Keto
					// answer cache.
					const permissions = options.permissions?.(context);

					const result = await evaluateGraphql(
						compiledPolicy,
						{
							type: 'graphql',
							operationType: typeName,
							field: fieldName,
							claims,
							args,
							source,
							info,
						},
						{
							evaluatePermissions: permissions?.evaluatePermissions,
							subject: permissions?.subject,
						},
					);

					// UNAUTHENTICATED used to fall through here, so a field under a
					// rule the REST guard answers 401 for let an anonymous caller
					// straight to its resolver. That was already wrong; with a Keto
					// rung it would also mean asking Keto about nobody.
					if (result.decision === 'UNAUTHENTICATED') {
						throw new GraphQLError(result.message ?? 'errors.unauthenticated', {
							extensions: { code: 'UNAUTHENTICATED', reason: result.reason },
						});
					}

					if (result.decision === 'DENY') {
						// `denial` is only ever set by a Keto rung, so an authority or
						// expression refusal throws exactly what it always did.
						throw result.denial
							? new GraphQLError(result.message ?? 'errors.not-found', {
									extensions: { code: result.denial, reason: result.reason },
								})
							: new GraphQLError(result.reason, {
									extensions: { code: 'FORBIDDEN' },
								});
					}

					return originalResolve(source, args, context, info);
				},
			};
		},
	});
}
