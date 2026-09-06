import type {
	GraphqlEvaluateInput,
	RestEvaluateInput,
	Rules,
} from '@nxgt/security/policy';
import { evaluateFromRules } from './exaluation.utils';
import type { EvaluateResponse } from './policy.types';

export class PolicyEvaluationService {
	/**
	 * Evaluate a REST or GraphQL request against the static `rules.yaml`.
	 */
	async evaluateFromRules(
		rules: Rules,
		input: RestEvaluateInput | GraphqlEvaluateInput,
	): Promise<EvaluateResponse> {
		return evaluateFromRules(rules, input);
	}
}
