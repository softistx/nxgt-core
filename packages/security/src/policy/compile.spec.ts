import { describe, expect, it } from 'bun:test';
import { compilePolicy } from './compile';
import { evaluateGraphql } from './graphql/evaluator';
import { evaluateRest } from './rest/evaluator';
import type { Rules } from './rules.schema';

describe('compilePolicy — expression cache is scope-aware', () => {
	it('evaluates identical expression text correctly under both REST and GraphQL scope', () => {
		// Same expression text appears in a REST rule (scope: claims, req) and a
		// GraphQL rule (scope: claims, args). If the compiled-function cache
		// keyed on expression text alone, the GraphQL entry could reuse the
		// REST-compiled Function (whose parameters are named claims/req), and
		// evaluating it with (claims, args) would bind the wrong value to the
		// `req`-named parameter.
		const sharedExpression = 'claims.sub === "user-1"';

		const rules: Rules = {
			rest: {
				'/widgets': {
					GET: { expression: { value: sharedExpression } },
				},
			},
			graphql: {
				Query: {
					widgets: { expression: { value: sharedExpression } },
				},
			},
		};

		const policy = compilePolicy(rules);

		const restResult = evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/widgets',
			claims: { sub: 'user-1' },
		});
		expect(restResult.decision).toBe('ALLOW');

		const graphqlResult = evaluateGraphql(policy, {
			type: 'graphql',
			operationType: 'Query',
			field: 'widgets',
			claims: { sub: 'user-1' },
			args: {},
		});
		expect(graphqlResult.decision).toBe('ALLOW');

		const graphqlDenied = evaluateGraphql(policy, {
			type: 'graphql',
			operationType: 'Query',
			field: 'widgets',
			claims: { sub: 'someone-else' },
			args: {},
		});
		expect(graphqlDenied.decision).toBe('DENY');
	});
});
