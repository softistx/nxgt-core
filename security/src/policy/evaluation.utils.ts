import type { PolicyClaims } from './claims.types';
import type { RuleEntry } from './rules.schema';

/** Compile a JS expression body into a callable Function — kept local so this
 * package has no dependency on `@nxgt/shared` just for a one-line helper. */
export const compileFunction = <T = (...args: unknown[]) => unknown>(
	body: string,
	...args: string[]
) => new Function(...args, `"use strict"; ${body}`) as T;

// ---------------------------------------------------------------------------
// Authority checking
// ---------------------------------------------------------------------------

/**
 * Evaluate the authority groups from a rule entry against the caller's claims.
 *
 * The effective authority set is the union of `claims.authorities`,
 * `claims.roles`, and the individual space-separated tokens in `claims.scope`
 * — any of the three can satisfy an authority requirement.
 *
 * Returns `true` when:
 *   - `rule.authorities` is null / undefined / empty  → auth-only, always pass
 *   - Every group (AND) contains at least one authority (OR) present in the
 *     caller's effective authority set
 */
export function checkAuthorities(
	rule: Pick<RuleEntry, 'authorities'>,
	claims: PolicyClaims,
): boolean {
	const groups = rule.authorities;

	// null / undefined / empty outer array → no authority constraint
	if (!groups || groups.length === 0) return true;

	const effective = new Set<string>([
		...(claims.authorities ?? []),
		...(claims.roles ?? []),
		...(claims.scope ? claims.scope.split(' ').filter(Boolean) : []),
	]);

	return groups.every((group) => {
		// empty inner group counts as satisfied
		if (group.length === 0) return true;
		return group.some((authority) => effective.has(authority));
	});
}

/**
 * Whether the token named a caller at all — a user (`sub`) or a confidential
 * client (`clientId`). The Hono guard hands `{}` through when no claims were
 * resolved, which is exactly the anonymous case.
 *
 * This is deliberately separate from `checkAuthorities`, which passes an empty
 * authority list unconditionally: "asks for no particular authority" and
 * "admits anonymous callers" are different statements, and conflating them is
 * what made `authorities: []` mean "everyone".
 */
export function isAuthenticated(claims: PolicyClaims): boolean {
	return Boolean(claims?.sub || claims?.clientId);
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

/**
 * Invoke an already-compiled expression Function (see `compilePolicy`)
 * against positional scope values, with the same falsy/throw → DENY
 * semantics as `evalExpression`. Kept separate from `evalExpression` since
 * the compiled path never re-parses the expression source.
 */
export function runCompiledExpression(
	compiled: { fn: (...args: unknown[]) => unknown; message: string },
	...args: unknown[]
): ExpressionResult {
	try {
		const result = compiled.fn(...args);
		if (!result) return { passed: false, message: compiled.message };
		return { passed: true, message: '' };
	} catch (err) {
		return {
			passed: false,
			message: `${compiled.message} — ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
