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

	it("rejects a typo'd GraphQL operation type instead of silently dropping it", () => {
		expect(() =>
			RulesSchema.parse({
				graphql: {
					Qeury: {
						widgets: { authorities: [['ADMIN']] },
					},
				},
			}),
		).toThrow();
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
