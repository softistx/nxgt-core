import { match } from 'path-to-regexp';
import type { GraphqlRuleEntry } from '../graphql/schema';
import type { RestRuleEntry } from '../rest/schema';
import type { Rules } from '../rules.schema';
import { createExpressionCompiler } from './expression';
import { compileGraphqlEntry } from './graphql';
import { compileRestRoute } from './rest';
import type { CompiledPolicy, CompiledRestRoute } from './types';

export type {
	CompiledExpression,
	CompiledGraphqlEntry,
	CompiledPolicy,
	CompiledRestRoute,
} from './types';

/**
 * Precompile a validated `Rules` document once (typically right after
 * `RulesSchema.parse(...)` at service startup) so `evaluateRest` /
 * `evaluateGraphql` do zero regex-compilation or `new Function` work on the
 * request hot path.
 */
export function compilePolicy(rules: Rules): CompiledPolicy {
	const compile = createExpressionCompiler();

	// `unmatched: deny` is REST-only, and silence would be the wrong way to
	// say so. `applyGraphqlPolicy` leaves a field with no rule entry
	// completely untouched — its resolver is never wrapped, so no evaluator
	// ever runs for it and no default could apply. Making it apply would mean
	// wrapping EVERY field of every type, `Note.title` included, and a
	// GraphQL document would have to enumerate the whole schema to boot. The
	// floor on that side is `@authenticated` on the fields themselves.
	if (rules.global?.unmatched === 'deny' && rules.graphql) {
		throw new Error(
			'Invalid rules document: `global.unmatched: deny` is REST-only, but ' +
				'this document also declares a `graphql:` block. Nothing would ' +
				'close on that side — `applyGraphqlPolicy` never wraps a field no ' +
				'rule names, so no default can reach it, and denying by default ' +
				'would mean naming every field of every type. Use `@authenticated` ' +
				'as the GraphQL floor and split the document, or drop the ' +
				'`graphql:` block if nothing serves it.',
		);
	}

	// Source document is keyed path → method (OpenAPI `paths`-style), but
	// request-time dispatch wants method → routes (O(1) lookup on the
	// incoming method, then a document-order scan of that method's
	// patterns). Build the latter by iterating the former: the matcher for
	// a path is computed once and shared across all methods declared on it.
	const restRoutesByMethod = new Map<string, CompiledRestRoute[]>();
	for (const [basePattern, methodMap] of Object.entries(rules.rest ?? {})) {
		const pattern = rules.global?.basePath
			? `${rules.global.basePath}${basePattern}`
			: basePattern;
		const matcher = match(pattern, { decode: decodeURIComponent });

		for (const [method, rule] of Object.entries(
			(methodMap ?? {}) as Record<string, RestRuleEntry>,
		)) {
			const route = compileRestRoute(rule, method, pattern, matcher, compile);
			const existing = restRoutesByMethod.get(method);
			if (existing) existing.push(route);
			else restRoutesByMethod.set(method, [route]);
		}
	}

	const graphql = rules.graphql
		? Object.fromEntries(
				Object.entries(rules.graphql).map(([operationType, fields]) => [
					operationType,
					Object.fromEntries(
						Object.entries(
							(fields ?? {}) as Record<string, GraphqlRuleEntry>,
						).map(([field, rule]) =>
							compileGraphqlEntry(rule, operationType, field, compile),
						),
					),
				]),
			)
		: undefined;

	return {
		...(rules.global ? { global: rules.global } : {}),
		restRoutesByMethod,
		...(graphql ? { graphql } : {}),
	};
}
