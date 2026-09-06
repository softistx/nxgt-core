import type { PolicyClaims } from '../claims.types';
import type { CompiledPolicy } from '../compile';
import {
	checkAuthorities,
	isAuthenticated,
	runCompiledExpression,
} from '../evaluation.utils';
import type { EvaluateResult } from '../rest/evaluator';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface GraphqlEvaluateInput {
	type: 'graphql';
	/**
	 * GraphQL operation type: "Query", "Mutation", or "Subscription".
	 * Must match the top-level key in rules.graphql exactly.
	 */
	operationType: string;
	/**
	 * Resolved field name, e.g. "createUser".
	 * Must match the second-level key under the operation type.
	 */
	field: string;
	/** Caller's claims extracted from the access token. */
	claims: PolicyClaims;
	/**
	 * Field arguments — made available in expression scope as `args`.
	 * Matches the YAML example: `args.input.username.toLowerCase() !== 'admin'`
	 */
	args?: Record<string, unknown>;
	/**
	 * The resolver's parent/source value — made available in expression
	 * scope as `source`. Lets rules express ownership checks on nested
	 * fields, e.g. `source.id === claims.sub` on `User.email`. Typed
	 * `unknown` rather than a concrete GraphQL type so this evaluator has no
	 * dependency on the `graphql` package — `applyGraphqlPolicy` (which does)
	 * passes the resolver's real `source` argument through here.
	 */
	source?: unknown;
	/**
	 * The resolver's `GraphQLResolveInfo` — made available in expression
	 * scope as `info` (fieldName, path, parentType, returnType, schema, ...).
	 * Typed `unknown` for the same reason as `source`.
	 */
	info?: unknown;
}

// Re-export so consumers only need to import from one evaluator file
export type { EvaluateResult };

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a GraphQL field resolution against a policy precompiled by
 * `compilePolicy`.
 *
 * Lookup: `policy.graphql[operationType][field]`
 *
 * Evaluation order (all must pass for ALLOW):
 *   1. Caller authenticated? — UNAUTHENTICATED on failure, unless the rule is
 *      marked `public`
 *   2. Authority groups checked (AND outer / OR inner) — DENY on failure
 *   3. Expression evaluated with `{ claims, args, source, info }` in scope —
 *      DENY on failure
 *
 * Step 1 mirrors the REST evaluator so the same `public`/`authenticated`
 * markers mean the same thing in both — a primitive that silently no-ops in
 * one of two evaluators is worse than none.
 *
 * Returns NOT_APPLICABLE when the operation type or field has no rule entry.
 */
export function evaluateGraphql(
	policy: CompiledPolicy,
	input: GraphqlEvaluateInput,
): EvaluateResult {
	const entry = policy.graphql?.[input.operationType]?.[input.field];

	if (!entry) {
		return {
			decision: 'NOT_APPLICABLE',
			reason: `No rule matched ${input.operationType}.${input.field}`,
		};
	}

	// Authentication floor — before authorities, so a field that asks for
	// nothing in particular still refuses anonymous callers.
	if (!entry.rule.public && !isAuthenticated(input.claims)) {
		return {
			decision: 'UNAUTHENTICATED',
			reason: `${input.operationType}.${input.field} requires an authenticated caller`,
		};
	}

	// Authority check
	if (!checkAuthorities(entry.rule, input.claims)) {
		return {
			decision: 'DENY',
			reason: `Insufficient authorities for ${input.operationType}.${input.field}`,
		};
	}

	// Expression check
	if (entry.compiledExpression) {
		const exprResult = runCompiledExpression(
			entry.compiledExpression,
			input.claims,
			input.args ?? {},
			input.source,
			input.info,
		);
		if (!exprResult.passed) {
			return { decision: 'DENY', reason: exprResult.message };
		}
	}

	return {
		decision: 'ALLOW',
		reason: `Matched rule for ${input.operationType}.${input.field}`,
	};
}
