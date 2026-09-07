import {
	compilePolicy,
	evaluateGraphql,
	evaluateRest,
	type GraphqlEvaluateInput,
	type RestEvaluateInput,
	type Rules,
} from '@nxgt/security/policy';
import { zDecision } from 'stx-sdk/auth';
import type { EvaluateResponse } from './policy.types';

export async function evaluateFromRules(
	rules: Rules,
	input: RestEvaluateInput | GraphqlEvaluateInput,
): Promise<EvaluateResponse> {
	// `@nxgt/security`'s evaluators take a compiled policy — the rules with
	// their path patterns and expressions already built — where the copy this
	// replaced took the raw document and compiled on every request.
	const policy = compilePolicy(rules);
	// `evaluateRest` is async since @nxgt/security 2.0.0 — a rule may carry a
	// Keto term, which is a remote question. This dry-run path supplies no
	// permission evaluator, so a rules document that carries one throws here
	// rather than being reported as an allow.
	const result =
		input.type === 'rest'
			? await evaluateRest(policy, input)
			: evaluateGraphql(policy, input);

	return {
		decision:
			result.decision === 'ALLOW'
				? zDecision.enum.ALLOW
				: result.decision === 'DENY'
					? zDecision.enum.DENY
					: zDecision.enum.NOT_APPLICABLE,
		reason: result.reason,
	};
}
