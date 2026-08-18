import { describe, expect, it } from 'bun:test';
import { RulesSchema } from './rules.schema';

describe('RulesSchema — REST method map', () => {
	it('accepts the QUERY method', () => {
		const rules = RulesSchema.parse({
			rest: {
				QUERY: {
					'/search': { authorities: [['ADMIN']] },
				},
			},
		});
		expect(rules.rest?.QUERY?.['/search']).toEqual({
			authorities: [['ADMIN']],
		});
	});

	it("rejects a typo'd HTTP method instead of silently dropping it", () => {
		expect(() =>
			RulesSchema.parse({
				rest: {
					GTE: {
						'/search': { authorities: [['ADMIN']] },
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
});
