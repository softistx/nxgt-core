import { describe, expect, it } from 'bun:test';
import {
	GraphQLID,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	graphql,
} from 'graphql';
import { compilePolicy } from '../compile';
import type { Rules } from '../rules.schema';
import { applyGraphqlPolicy } from './resolvers';

function buildSchema() {
	const userType = new GraphQLObjectType({
		name: 'User',
		fields: {
			id: { type: GraphQLID, resolve: (u) => u.id },
			username: { type: GraphQLString, resolve: (u) => u.username },
			email: { type: GraphQLString, resolve: (u) => u.email },
		},
	});

	const queryType = new GraphQLObjectType({
		name: 'Query',
		fields: {
			me: {
				type: userType,
				resolve: () => ({
					id: '1',
					username: 'alice',
					email: 'alice@example.com',
				}),
			},
			widgets: {
				type: GraphQLString,
				resolve: () => 'public widgets',
			},
		},
	});

	return new GraphQLSchema({ query: queryType });
}

describe('applyGraphqlPolicy', () => {
	it('allows a field with no rule entry to pass through untouched (NOT_APPLICABLE = open)', async () => {
		const policy = compilePolicy({});
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'user-1' }),
		});

		const result = await graphql({
			schema,
			source: '{ widgets }',
			contextValue: {},
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ widgets: 'public widgets' });
	});

	it('delegates to the original resolver on ALLOW', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: { authorities: [['ADMIN']] },
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'user-1', authorities: ['ADMIN'] }),
		});

		const result = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: {},
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ me: { email: 'alice@example.com' } });
	});

	it('throws a GraphQLError instead of resolving on DENY', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: { authorities: [['ADMIN']] },
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'user-1', authorities: [] }),
		});

		const result = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: {},
		});

		expect(result.data?.me).toEqual({ email: null });
		expect(result.errors).toHaveLength(1);
		expect(result.errors?.[0]?.message).toContain('Insufficient authorities');
		expect(result.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
	});

	it('extracts claims via the getClaims callback with the real resolver context', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: { authorities: [['ADMIN']] },
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: (context) => (context as { claims: any }).claims,
		});

		const result = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: { claims: { sub: 'user-1', authorities: ['ADMIN'] } },
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ me: { email: 'alice@example.com' } });
	});

	it('targets fields on a nested/returned type (User.email), not just root Query fields', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: { authorities: [['ADMIN']] },
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'user-1', authorities: [] }),
		});

		// username has no rule — must still resolve even though the sibling
		// email field on the same type is DENY.
		const result = await graphql({
			schema,
			source: '{ me { username } }',
			contextValue: {},
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ me: { username: 'alice' } });
	});

	it('exposes `source` in expression scope for ownership checks', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: {
						expression: { value: 'source.id === claims.sub' },
					},
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'someone-else' }),
		});

		const denied = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: {},
		});
		expect(denied.data?.me).toEqual({ email: null });
		expect(denied.errors).toHaveLength(1);

		const schemaForOwner = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: '1' }),
		});
		const allowed = await graphql({
			schema: schemaForOwner,
			source: '{ me { email } }',
			contextValue: {},
		});
		expect(allowed.errors).toBeUndefined();
		expect(allowed.data).toEqual({ me: { email: 'alice@example.com' } });
	});

	it('exposes `info` (GraphQLResolveInfo) in expression scope', async () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: {
						expression: { value: "info.fieldName === 'email'" },
					},
				},
			},
		};
		const policy = compilePolicy(rules);
		const schema = applyGraphqlPolicy(buildSchema(), policy, {
			getClaims: () => ({ sub: 'user-1' }),
		});

		const result = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: {},
		});

		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ me: { email: 'alice@example.com' } });
	});
});
