import { describe, expect, it } from 'bun:test';
import {
	GraphQLID,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	graphql,
} from 'graphql';
import type { Rules } from '../rules.schema';
import { applyGraphqlPolicy, NonNullRuleFieldError } from './resolvers';

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

function buildSchemaWithNonNullEmail() {
	const userType = new GraphQLObjectType({
		name: 'User',
		fields: {
			id: { type: GraphQLID, resolve: (u) => u.id },
			email: {
				type: new GraphQLNonNull(GraphQLString),
				resolve: (u) => u.email,
			},
		},
	});

	const queryType = new GraphQLObjectType({
		name: 'Query',
		fields: {
			me: {
				type: userType,
				resolve: () => ({ id: '1', email: 'alice@example.com' }),
			},
		},
	});

	return new GraphQLSchema({ query: queryType });
}

describe('applyGraphqlPolicy', () => {
	it('allows a field with no rule entry to pass through untouched (NOT_APPLICABLE = open)', async () => {
		const schema = applyGraphqlPolicy(
			buildSchema(),
			{},
			{
				getClaims: () => ({ sub: 'user-1' }),
			},
		);

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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
			getClaims: () => ({ sub: 'someone-else' }),
		});

		const denied = await graphql({
			schema,
			source: '{ me { email } }',
			contextValue: {},
		});
		expect(denied.data?.me).toEqual({ email: null });
		expect(denied.errors).toHaveLength(1);

		const schemaForOwner = applyGraphqlPolicy(buildSchema(), rules, {
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
		const schema = applyGraphqlPolicy(buildSchema(), rules, {
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

	describe('non-null field safety', () => {
		const rules: Rules = {
			graphql: {
				User: {
					email: { authorities: [['ADMIN']] },
				},
			},
		};

		it('throws NonNullRuleFieldError at wrap time by default for a rule on a non-null field', async () => {
			expect(() =>
				applyGraphqlPolicy(buildSchemaWithNonNullEmail(), rules, {
					getClaims: () => ({ sub: 'user-1' }),
				}),
			).toThrow(NonNullRuleFieldError);
		});

		it('does not throw for a rule on a nullable field', async () => {
			expect(() =>
				applyGraphqlPolicy(buildSchema(), rules, {
					getClaims: () => ({ sub: 'user-1' }),
				}),
			).not.toThrow();
		});

		it('proceeds when strict: false explicitly acknowledges the cascade risk', async () => {
			const schema = applyGraphqlPolicy(buildSchemaWithNonNullEmail(), rules, {
				getClaims: () => ({ sub: 'user-1', authorities: [] }),
				strict: false,
			});

			// DENY on the non-null `email` field cascades to the nearest
			// nullable ancestor (`me`) per the GraphQL spec — this is the
			// documented, acknowledged trade-off of strict: false, not a bug.
			const result = await graphql({
				schema,
				source: '{ me { email } }',
				contextValue: {},
			});

			expect(result.data).toEqual({ me: null });
			expect(result.errors).toHaveLength(1);
			expect(result.errors?.[0]?.message).toContain('Insufficient authorities');
		});
	});
});

describe('applyGraphqlPolicy — the decisions it used to drop', () => {
	/**
	 * Before this, the wrapper branched on DENY alone. A field under a rule
	 * that `evaluateRest` answers 401 for let an anonymous caller straight to
	 * its resolver — the same rule, the same document, two different answers
	 * depending on the transport. With a `keto` rung it would also have meant
	 * asking Keto about nobody.
	 */
	it('refuses an anonymous caller instead of resolving the field', async () => {
		const schema = applyGraphqlPolicy(
			buildSchema(),
			{ graphql: { Query: { me: { authenticated: true } } } } as Rules,
			{ getClaims: () => ({}) as any },
		);

		const result = await graphql({ schema, source: '{ me { id } }' });

		expect(result.data?.me).toBeNull();
		expect(result.errors?.[0]?.message).toBe('errors.unauthenticated');
		expect(result.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
	});

	it('carries a Keto rung’s denial and message onto the error', async () => {
		// `User.email` is the field-on-a-returned-type case: it names its object
		// through `source.id`, which is exactly why the GraphQL grammar has a
		// `source.` root and REST does not.
		const asked: string[] = [];
		const schema = applyGraphqlPolicy(
			buildSchema(),
			{
				graphql: {
					User: {
						email: {
							keto: [
								{
									permissions: [
										[
											{
												namespace: 'User',
												permit: 'read-email',
												id: 'source.id',
											},
										],
									],
									onDeny: 'NOT_FOUND',
									message: 'users.errors.not-found',
								},
							],
						},
					},
				},
			} as Rules,
			{
				getClaims: () => ({ sub: 'idn-7' }),
				permissions: () => ({
					subject: 'idn-7',
					evaluatePermissions: async (requirement, objectsOf) => {
						for (const group of requirement) {
							for (const term of group) asked.push(...objectsOf(term));
						}
						return false;
					},
				}),
			},
		);

		const result = await graphql({ schema, source: '{ me { id email } }' });

		// The id came off the parent object, not off an argument.
		expect(asked).toEqual(['1']);
		expect((result.data?.me as any)?.email).toBeNull();
		expect((result.data?.me as any)?.id).toBe('1');
		expect(result.errors?.[0]?.message).toBe('users.errors.not-found');
		expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
	});
});
