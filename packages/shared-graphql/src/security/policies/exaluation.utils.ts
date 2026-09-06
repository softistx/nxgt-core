import {
	evaluateGraphql,
	evaluateRest,
	type GraphqlEvaluateInput,
	type RestEvaluateInput,
	type Rules,
} from '@nxgt/shared/policy';
import { zDecision } from 'stx-sdk/auth';
import type { EvaluateResponse } from './policy.types';

export async function evaluateFromRules(
	rules: Rules,
	input: RestEvaluateInput | GraphqlEvaluateInput,
): Promise<EvaluateResponse> {
	const result =
		input.type === 'rest'
			? evaluateRest(rules, input)
			: evaluateGraphql(rules, input);

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
