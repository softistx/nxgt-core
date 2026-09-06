import { describe, expect, it } from 'bun:test';
import { RulesSchema } from './rules.schema';

describe('RulesSchema — REST path map', () => {
	it('accepts the QUERY method', () => {
		const rules = RulesSchema.parse({
			rest: {
				'/search': {
					QUERY: { authorities: [['ADMIN']] },
				},
			},
		});
		expect(rules.rest?.['/search']?.QUERY).toEqual({
			authorities: [['ADMIN']],
		});
	});

	it("rejects a typo'd HTTP method instead of silently dropping it", () => {
		expect(() =>
			RulesSchema.parse({
				rest: {
					'/search': {
						GTE: { authorities: [['ADMIN']] },
					},
				},
			}),
		).toThrow();
	});

	it('accepts arbitrary GraphQL type names beyond Query/Mutation/Subscription', () => {
		// Rules can target fields on any object type the schema returns (e.g.
		// User, Employee), not just root operation fields — this is what lets
		// applyGraphqlPolicy wrap resolvers anywhere in the schema, not just at
		// the root. As a consequence, a typo'd root type name (e.g. "Qeury")
		// can no longer be rejected at parse time: it's indistinguishable from
		// a legitimate custom type name.
		const rules = RulesSchema.parse({
			graphql: {
				User: {
					email: { authorities: [['ADMIN', 'users:read']] },
				},
				Employee: {
					salary: { authorities: [['ADMIN', 'payroll:read']] },
				},
			},
		});
		expect(rules.graphql?.User?.email).toEqual({
			authorities: [['ADMIN', 'users:read']],
		});
		expect(rules.graphql?.Employee?.salary).toEqual({
			authorities: [['ADMIN', 'payroll:read']],
		});
	});

	it('accepts declarative per-rule cors and rateLimit overrides on both REST and GraphQL leaves', () => {
		const rules = RulesSchema.parse({
			rest: {
				'/widgets': {
					GET: {
						cors: {
							origins: ['https://example.com'],
							methods: ['GET'],
							allowedHeaders: [],
						},
						rateLimit: { windowMs: 60_000, limit: 10 },
					},
				},
			},
			graphql: {
				Query: {
					widgets: {
						cors: {
							origins: ['https://example.com'],
							methods: ['GET'],
							allowedHeaders: [],
						},
						rateLimit: { windowMs: 60_000, limit: 10 },
					},
				},
			},
		});
		expect(rules.rest?.['/widgets']?.GET?.rateLimit).toEqual({
			windowMs: 60_000,
			limit: 10,
		});
		expect(rules.graphql?.Query?.widgets?.cors?.origins).toEqual([
			'https://example.com',
		]);
	});
});
