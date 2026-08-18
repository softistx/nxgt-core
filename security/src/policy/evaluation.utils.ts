import type { PolicyClaims } from './claims.types';
import type { RuleEntry } from './rules.schema';

/** Compile a JS expression body into a callable Function — kept local so this
 * package has no dependency on `@nxgt/shared` just for a one-line helper. */
const compileFunction = <T = (...args: unknown[]) => unknown>(
	body: string,
	...args: string[]
) => new Function(...args, `"use strict"; ${body}`) as T;

// ---------------------------------------------------------------------------
// Authority checking
// ---------------------------------------------------------------------------

/**
 * Evaluate the authority groups from a rule entry against the caller's claims.
 *
 * Returns `true` when:
 *   - `rule.authorities` is null / undefined / empty  → auth-only, always pass
 *   - Every group (AND) contains at least one authority (OR) present in the
 *     caller's effective authority set
 */
export function checkAuthorities(
	rule: RuleEntry,
	claims: PolicyClaims,
): boolean {
	const groups = rule.authorities;

	// null / undefined / empty outer array → no authority constraint
	if (!groups || groups.length === 0) return true;

	const effective = new Set(claims.authorities || []);

	return groups.every((group) => {
		// empty inner group counts as satisfied
		if (group.length === 0) return true;
		return group.some((authority) => effective.has(authority));
	});
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

export interface ExpressionResult {
	passed: boolean;
	/** Failure message — only meaningful when passed === false */
	message: string;
}

/**
 * Evaluate a rule expression against a dynamic scope object.
 *
 * The expression string is wrapped as the body of a Function whose parameter
 * names are the keys of `scope`. This keeps the API flexible: REST evaluator
 * passes `{ claims, req }`, GraphQL evaluator passes `{ claims, args }`.
 *
 * Returns `{ passed: false, message }` on:
 *   - falsy expression result
 *   - any thrown error (expression is treated as failed, not as a server error)
 */
export function evalExpression(
	expression: NonNullable<RuleEntry['expression']>,
	scope: Record<string, unknown>,
): ExpressionResult {
	const failMessage = expression.message ?? 'Expression check failed';
	try {
		const fn = compileFunction(
			`return (${expression.value});`,
			...Object.keys(scope),
		);
		const result = fn(...Object.values(scope));
		if (!result) return { passed: false, message: failMessage };
		return { passed: true, message: '' };
	} catch (err) {
		return {
			passed: false,
			message: `${failMessage} — ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
