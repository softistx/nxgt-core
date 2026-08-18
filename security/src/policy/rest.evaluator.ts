import type { PolicyClaims } from './claims.types';
import type { CompiledPolicy } from './compile';
import { checkAuthorities, runCompiledExpression } from './evaluation.utils';

// ---------------------------------------------------------------------------
// Input / output types
// ---------------------------------------------------------------------------

export interface RestEvaluateInput {
	type: 'rest';
	/** HTTP method — normalised to uppercase internally. */
	method: string;
	/** Request pathname, e.g. "/api/users/123". */
	path: string;
	/** Caller's claims extracted from the access token. */
	claims: PolicyClaims;
	/**
	 * Request context made available in expression scope as `req`.
	 * Path params captured by path-to-regexp are merged into `req.params`
	 * (caller-supplied params win on key collision).
	 */
	req?: {
		body?: unknown;
		params?: Record<string, string>;
		query?: Record<string, string>;
		headers?: Record<string, string>;
		cookies?: Record<string, string>;
	};
}

export interface EvaluateResult {
	decision: 'ALLOW' | 'DENY' | 'NOT_APPLICABLE';
	reason: string;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a REST request against a policy precompiled by `compilePolicy`.
 *
 * Matching strategy (first match wins, evaluated in rules document order):
 *   1. Routes for the request's HTTP method looked up directly (O(1))
 *   2. Path pattern matched via each precompiled path-to-regexp matcher,
 *      in document order, until one matches
 *   3. Authority groups checked (AND outer / OR inner) — DENY on failure
 *   4. Expression evaluated with `{ claims, req }` in scope — DENY on failure
 *   5. Both checks pass → ALLOW
 *
 * Returns NOT_APPLICABLE when no path entry matches for that method.
 */
export function evaluateRest(
	policy: CompiledPolicy,
	input: RestEvaluateInput,
): EvaluateResult {
	const method = input.method.toUpperCase();
	const routes = policy.restRoutesByMethod.get(method);

	if (routes) {
		for (const route of routes) {
			const result = route.matcher(input.path);
			if (result === false) continue;

			// Merge path captures with caller-supplied params; caller wins on collision
			const mergedParams: Record<string, string> = {
				...(result.params as Record<string, string>),
				...(input.req?.params ?? {}),
			};

			const req = { ...(input.req ?? {}), params: mergedParams };

			// Substitute `$domain` into a LOCAL copy of the authority groups — never
			// write back onto `route.rule.authorities`, which lives inside the
			// long-lived, shared compiled policy reused across every request.
			// Mutating it in place would permanently bake the first request's
			// domain value into the cached rule, corrupting authority checks for
			// every subsequent request (including ones for a different domain).
			let authorities = route.rule.authorities;
			if (route.hasDomainPlaceholder && result.params.domain) {
				const domainValue = result.params.domain.toString();
				authorities = authorities?.map((group) =>
					group.map((authority) =>
						authority.replaceAll('$domain', domainValue),
					),
				);
			}

			// Authority check
			if (!checkAuthorities({ authorities }, input.claims)) {
				return {
					decision: 'DENY',
					reason: `Insufficient authorities for ${method} ${input.path}`,
				};
			}

			// Expression check
			if (route.compiledExpression) {
				const exprResult = runCompiledExpression(
					route.compiledExpression,
					input.claims,
					req,
				);
				if (!exprResult.passed) {
					return { decision: 'DENY', reason: exprResult.message };
				}
			}

			return {
				decision: 'ALLOW',
				reason: `Matched rule for ${method} ${route.pattern}`,
			};
		}
	}

	return {
		decision: 'NOT_APPLICABLE',
		reason: `No rule matched ${method} ${input.path}`,
	};
}
