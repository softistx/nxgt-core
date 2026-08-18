import type { PolicyClaims } from './claims.types';
import { checkAuthorities, evalExpression } from './evaluation.utils';
import type { EvaluateResult } from './rest.evaluator';
import type { Rules } from './rules.schema';

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
}

// Re-export so consumers only need to import from one evaluator file
export type { EvaluateResult };

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a GraphQL field resolution against the loaded rules document.
 *
 * Lookup: `rules.graphql[operationType][field]`
 *
 * Evaluation order (both must pass for ALLOW):
 *   1. Authority groups checked (AND outer / OR inner) — DENY on failure
 *   2. Expression evaluated with `{ claims, args }` in scope — DENY on failure
 *
 * Returns NOT_APPLICABLE when the operation type or field has no rule entry.
 */
export function evaluateGraphql(
	rules: Rules,
	input: GraphqlEvaluateInput,
): EvaluateResult {
	const rule = rules.graphql?.[input.operationType]?.[input.field];

	if (!rule) {
		return {
			decision: 'NOT_APPLICABLE',
			reason: `No rule matched ${input.operationType}.${input.field}`,
		};
	}

	// Authority check
	if (!checkAuthorities(rule, input.claims)) {
		return {
			decision: 'DENY',
			reason: `Insufficient authorities for ${input.operationType}.${input.field}`,
		};
	}

	// Expression check
	if (rule.expression) {
		const exprResult = evalExpression(rule.expression, {
			claims: input.claims,
			args: input.args ?? {},
		});
		if (!exprResult.passed) {
			return { decision: 'DENY', reason: exprResult.message };
		}
	}

	return {
		decision: 'ALLOW',
		reason: `Matched rule for ${input.operationType}.${input.field}`,
	};
}
