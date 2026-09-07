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

describe('RulesSchema — Keto terms', () => {
	const rung = (extra: Record<string, unknown> = {}) => ({
		rest: {
			'/bookmarks/:id': {
				GET: {
					keto: [
						{
							permissions: [
								[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
							],
							...extra,
						},
					],
				},
			},
		},
	});

	it('defaults `onDeny` to NOT_FOUND and `id` to param.id', () => {
		const rules = RulesSchema.parse({
			rest: {
				'/bookmarks/:id': {
					GET: {
						keto: [
							{ permissions: [[{ namespace: 'Bookmark', permit: 'view' }]] },
						],
					},
				},
			},
		});
		const [check] = rules.rest?.['/bookmarks/:id']?.GET?.keto ?? [];
		expect(check?.onDeny).toBe('NOT_FOUND');
		expect(check?.permissions[0]?.[0]?.id).toBe('param.id');
	});

	it('rejects a requirement that admits nobody', () => {
		// `[]` — an empty disjunction is satisfied by nothing at all.
		expect(() =>
			RulesSchema.parse({
				rest: { '/x': { GET: { keto: [{ permissions: [] }] } } },
			}),
		).toThrow();
	});

	it('rejects a requirement that admits everyone', () => {
		// `[[]]` — a conjunction over no terms is vacuously true. This is the
		// dangerous one: it reads like "no permission needed" and behaves like
		// "no check at all".
		expect(() =>
			RulesSchema.parse({
				rest: { '/x': { GET: { keto: [{ permissions: [[]] }] } } },
			}),
		).toThrow();
	});

	it('rejects an id that is not param., query. or json.', () => {
		expect(
			() => RulesSchema.parse(rung()).rest?.['/bookmarks/:id'],
		).not.toThrow();
		expect(() =>
			RulesSchema.parse({
				rest: {
					'/x': {
						GET: {
							keto: [
								{
									permissions: [
										// `args.` is the GraphQL grammar — meaningless here.
										[{ namespace: 'B', permit: 'view', id: 'args.id' }],
									],
								},
							],
						},
					},
				},
			}),
		).toThrow();
	});

	it('rejects a `keto` term on a GraphQL rule, which no evaluator honours', () => {
		// The field is declared on the REST rule entry only. Were it on the
		// shared one, this would parse, autocomplete, and then be ignored.
		expect(() =>
			RulesSchema.parse({
				graphql: {
					Query: {
						note: {
							keto: [
								{
									permissions: [
										[{ namespace: 'Note', permit: 'view', id: 'param.id' }],
									],
								},
							],
						},
					},
				},
			}),
		).toThrow();
	});
});
