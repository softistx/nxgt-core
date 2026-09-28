import { describe, expect, it } from 'bun:test';
import type { Ory } from '@nxgt/ory-sdk';
import { GraphQLObjectType, GraphQLSchema, graphql } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import {
	AUTHENTICATED_DIRECTIVE_SDL,
	KETO_DIRECTIVES_SDL,
} from '../directives';
import { applyAuthenticated } from './apply-authenticated';
import { applyKetoChecks } from './apply-keto-checks';
import { useAuthenticated } from './authenticated';
import { useKetoChecks } from './keto-checks';

/**
 * Each transform marks the fields it guarded, and leaves them alone when it
 * runs again. That is what lets two `onSchemaChange` plugins settle — and a
 * schema merged from a guarded half and an unguarded one gets the second
 * half guarded, not waved through.
 */
const typeDefs = [
	AUTHENTICATED_DIRECTIVE_SDL,
	KETO_DIRECTIVES_SDL,
	`type Query {
		note(id: ID!): String @authenticated(type: ["session"]) @permission(name: "view", type: "Note")
	}`,
];
const resolvers = { Query: { note: () => 'n' } };

describe('a transform run again', () => {
	it('returns the schema as it is when no field is left to guard', () => {
		const once = applyKetoChecks(
			applyAuthenticated(createSchema({ typeDefs, resolvers })),
		);
		expect(applyAuthenticated(once)).toBe(once);
		expect(applyKetoChecks(once)).toBe(once);
	});

	it('guards the unguarded half of a merged schema', async () => {
		const sdl = (field: string) => [
			AUTHENTICATED_DIRECTIVE_SDL,
			`type Query { ${field}: String @authenticated }`,
		];
		const guarded = applyAuthenticated(
			createSchema({
				typeDefs: sdl('a'),
				resolvers: { Query: { a: () => 'A' } },
			}),
		);
		const open = createSchema({
			typeDefs: sdl('b'),
			resolvers: { Query: { b: () => 'B' } },
		});
		// What a merge does: the fields of both, and the first one's extensions.
		const fields = (schema: GraphQLSchema) =>
			schema.getQueryType()?.toConfig().fields ?? {};
		const merged = applyAuthenticated(
			new GraphQLSchema({
				...guarded.toConfig(),
				query: new GraphQLObjectType({
					name: 'Query',
					fields: { ...fields(guarded), ...fields(open) },
				}),
				types: [],
			}),
		);

		const result = await graphql({
			schema: merged,
			source: '{ a b }',
			contextValue: {},
		});
		expect(result.data).toEqual({ a: null, b: null });
		expect(result.errors).toHaveLength(2);
	});
});

describe('useAuthenticated beside useKetoChecks', () => {
	/** A Keto that refuses everything, and counts what it was asked. */
	function refusingOry() {
		const asked = { count: 0 };
		const ory = {
			checkMany: async (questions: unknown[]) => {
				asked.count += questions.length;
				return questions.map(() => false);
			},
		} as unknown as Ory;
		return { ory, asked };
	}

	for (const order of ['authenticated first', 'keto first'] as const) {
		it(`keeps both guards, each once — ${order}`, async () => {
			const { ory, asked } = refusingOry();
			const plugins =
				order === 'authenticated first'
					? [useAuthenticated(), useKetoChecks(ory)]
					: [useKetoChecks(ory), useAuthenticated()];
			const ask = async (kind: string) => {
				const yoga = createYoga({
					schema: createSchema({ typeDefs, resolvers }),
					context: { user: { sub: 'idn-7' }, ory: { kind, subject: 'idn-7' } },
					plugins,
				});
				return (
					await yoga.fetch('http://api.test/graphql?query={note(id:"n1")}')
				).status;
			};

			// A token is refused by @authenticated, before Keto is asked.
			expect(await ask('token')).toBe(403);
			expect(asked.count).toBe(0);
			// A session passes it, and Keto refuses: one question, not two.
			expect(await ask('session')).toBe(404);
			expect(asked.count).toBe(1);
		});
	}
});
