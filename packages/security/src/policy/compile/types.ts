import type { MatchFunction } from 'path-to-regexp';
import type { GraphqlRuleEntry } from '../graphql/schema';
import type { RestRuleEntry } from '../rest/schema';
import type { Rules } from '../rules.schema';

export interface CompiledExpression {
	fn: (...args: unknown[]) => unknown;
	/** Failure message baked in at compile time (custom or default). */
	message: string;
}

export interface CompiledRestRoute {
	/** basePath-prefixed pattern, precomputed once. */
	pattern: string;
	matcher: MatchFunction<Partial<Record<string, string | string[]>>>;
	rule: RestRuleEntry;
	/** Precomputed so the per-request path never re-scans `rule.authorities`. */
	hasDomainPlaceholder: boolean;
	compiledExpression?: CompiledExpression;
	/**
	 * True when some Keto term on this route reads `json.<path>`, so the guard
	 * knows to buffer the request body. Precomputed for the same reason
	 * `hasDomainPlaceholder` is: the request path must not re-scan the rule.
	 */
	ketoReadsBody: boolean;
}

export interface CompiledGraphqlEntry {
	rule: GraphqlRuleEntry;
	compiledExpression?: CompiledExpression;
}

export interface CompiledPolicy {
	global?: Rules['global'];
	/**
	 * Routes partitioned by HTTP method, each list in document order
	 * (evaluateRest is first-match-wins within a method's list). Partitioning
	 * at compile time means the request-time path only ever scans patterns
	 * registered for the actual requested method, not every route.
	 */
	restRoutesByMethod: Map<string, CompiledRestRoute[]>;
	graphql?: Record<string, Record<string, CompiledGraphqlEntry>>;
}
