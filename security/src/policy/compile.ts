import { type MatchFunction, match } from 'path-to-regexp';
import { compileFunction } from './evaluation.utils';
import type { RuleEntry, Rules } from './rules.schema';

// ---------------------------------------------------------------------------
// Compiled shapes
// ---------------------------------------------------------------------------

export interface CompiledExpression {
	fn: (...args: unknown[]) => unknown;
	/** Failure message baked in at compile time (custom or default). */
	message: string;
}

export interface CompiledRestEntry {
	rule: RuleEntry;
	/** Precomputed so the per-request path never re-scans `rule.authorities`. */
	hasDomainPlaceholder: boolean;
	compiledExpression?: CompiledExpression;
}

export interface CompiledRestRoute {
	/** basePath-prefixed pattern, precomputed once. */
	pattern: string;
	matcher: MatchFunction<Partial<Record<string, string | string[]>>>;
	methods: Map<string, CompiledRestEntry>;
}

export interface CompiledGraphqlEntry {
	rule: RuleEntry;
	compiledExpression?: CompiledExpression;
}

export interface CompiledPolicy {
	global?: Rules['global'];
	/** Document order preserved — evaluateRest is first-match-wins. */
	restRoutes: CompiledRestRoute[];
	graphql?: Record<string, Record<string, CompiledGraphqlEntry>>;
}

// ---------------------------------------------------------------------------
// Expression compilation cache
// ---------------------------------------------------------------------------

const REST_SCOPE = ['claims', 'req'] as const;
const GRAPHQL_SCOPE = ['claims', 'args'] as const;

/**
 * Compiles `expression.value` strings into Functions, memoized per
 * `compilePolicy()` call. The cache key includes the scope-key shape (not
 * just the expression text) so identical expression text used under REST's
 * `['claims','req']` scope and GraphQL's `['claims','args']` scope never
 * collides and binds the wrong positional argument to the wrong parameter.
 */
function createExpressionCompiler() {
	const cache = new Map<string, (...args: unknown[]) => unknown>();

	return (value: string, scopeKeys: readonly string[]) => {
		const key = `${scopeKeys.join(',')}::${value}`;
		let fn = cache.get(key);
		if (!fn) {
			fn = compileFunction<(...args: unknown[]) => unknown>(
				`return (${value});`,
				...scopeKeys,
			);
			cache.set(key, fn);
		}
		return fn;
	};
}

function compileExpression(
	expression: RuleEntry['expression'],
	compile: ReturnType<typeof createExpressionCompiler>,
	scopeKeys: readonly string[],
): CompiledExpression | undefined {
	if (!expression) return undefined;
	return {
		fn: compile(expression.value, scopeKeys),
		message: expression.message ?? 'Expression check failed',
	};
}

// ---------------------------------------------------------------------------
// compilePolicy
// ---------------------------------------------------------------------------

/**
 * Precompile a validated `Rules` document once (typically right after
 * `RulesSchema.parse(...)` at service startup) so `evaluateRest` /
 * `evaluateGraphql` do zero regex-compilation or `new Function` work on the
 * request hot path.
 */
export function compilePolicy(rules: Rules): CompiledPolicy {
	const compile = createExpressionCompiler();

	const restRoutes: CompiledRestRoute[] = Object.entries(rules.rest ?? {}).map(
		([basePattern, methodMap]) => {
			const pattern = rules.global?.basePath
				? `${rules.global.basePath}${basePattern}`
				: basePattern;
			const matcher = match(pattern, { decode: decodeURIComponent });

			const methods = new Map<string, CompiledRestEntry>();
			for (const [method, rule] of Object.entries(methodMap)) {
				const hasDomainPlaceholder = Boolean(
					rule.authorities?.some((group) =>
						group.some((authority) => authority.includes('$domain')),
					),
				);
				methods.set(method, {
					rule,
					hasDomainPlaceholder,
					compiledExpression: compileExpression(
						rule.expression,
						compile,
						REST_SCOPE,
					),
				});
			}

			return { pattern, matcher, methods };
		},
	);

	const graphql = rules.graphql
		? Object.fromEntries(
				Object.entries(rules.graphql).map(([operationType, fields]) => [
					operationType,
					Object.fromEntries(
						Object.entries(fields).map(([field, rule]) => [
							field,
							{
								rule,
								compiledExpression: compileExpression(
									rule.expression,
									compile,
									GRAPHQL_SCOPE,
								),
							} satisfies CompiledGraphqlEntry,
						]),
					),
				]),
			)
		: undefined;

	return { global: rules.global, restRoutes, graphql };
}
