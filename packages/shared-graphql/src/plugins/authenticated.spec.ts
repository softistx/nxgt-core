import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { type ExecutionResult, graphql, parse } from 'graphql';
import { createSchema, createYoga } from 'graphql-yoga';
import {
	AUTHENTICATED_DIRECTIVE_SDL,
	KETO_DIRECTIVES_SDL,
} from '../directives';
import { buildSubgraphSchema } from '../utils/schema.utils';
import { applyAuthenticated } from './apply-authenticated';
import { useAuthenticated } from './authenticated';
import { useKetoChecks } from './keto-checks';

const SDL = `
interface Node @authenticated { id: ID! }
type Staff implements Node @authenticated(type: ["session"]) { id: ID!, name: String }
type Query {
	open: String
	me: String @authenticated
	machine: String @authenticated(type: ["token"])
	staff: Staff
}
`;

const schema = applyAuthenticated(
	createSchema({
		typeDefs: [AUTHENTICATED_DIRECTIVE_SDL, SDL],
		resolvers: {
			Query: {
				open: () => 'anyone',
				me: () => 'me',
				machine: () => 'machine',
				staff: () => ({ id: 's1', name: 'Ada' }),
			},
		},
	}),
);

const session = { user: { sub: 'idn-7' }, ory: { kind: 'session' } };
const token = { user: { sub: 'client-1' }, ory: { kind: 'token' } };

const run = (source: string, contextValue: object, over = schema) =>
	graphql({ schema: over, source, contextValue });

const codeOf = (result: ExecutionResult) =>
	result.errors?.[0]?.extensions?.code;

describe('@authenticated', () => {
	it('refuses an anonymous caller UNAUTHENTICATED (401), and leaves open fields open', async () => {
		const result = await run('{ open me }', {});
		expect(result.data).toEqual({ open: 'anyone', me: null });
		expect(result.errors?.[0]?.extensions).toEqual({
			code: ErrorCode.Unauthenticated,
			http: { status: 401 },
		});
	});

	it('admits any caller without `type`', async () => {
		expect((await run('{ me }', session)).data).toEqual({ me: 'me' });
		expect((await run('{ me }', token)).data).toEqual({ me: 'me' });
	});

	it('refuses a caller of another type FORBIDDEN (403)', async () => {
		expect(codeOf(await run('{ machine }', session))).toBe(ErrorCode.Forbidden);
		expect((await run('{ machine }', token)).data).toEqual({
			machine: 'machine',
		});
	});

	it("guards a type's fields, AND-ed with its interfaces'", async () => {
		const query = '{ staff { id name } }';
		expect(codeOf(await run(query, {}))).toBe(ErrorCode.Unauthenticated);
		expect(codeOf(await run(query, token))).toBe(ErrorCode.Forbidden);
		expect((await run(query, session)).data).toEqual({
			staff: { id: 's1', name: 'Ada' },
		});
	});

	it("reads the caller's type from user.tokenType without Ory", async () => {
		const gateway = { user: { sub: 'client-1', tokenType: 'token' } };
		expect((await run('{ machine }', gateway)).data).toEqual({
			machine: 'machine',
		});
	});

	it('never wraps a field twice', () => {
		expect(applyAuthenticated(schema)).toBe(schema);
	});
});

describe('applyAuthenticated refuses at build', () => {
	const build = (sdl: string, types?: string[]) => () =>
		applyAuthenticated(
			createSchema({ typeDefs: [AUTHENTICATED_DIRECTIVE_SDL, sdl] }),
			types ? { types } : {},
		);

	it('`type: []`, which admits no caller', () => {
		expect(build('type Query { me: String @authenticated(type: []) }')).toThrow(
			/@authenticated on Query\.me: `type: \[\]` admits no caller/,
		);
	});

	it('a type outside the known ones, naming them', () => {
		const sdl = 'type Query { me: String @authenticated(type: ["staff"]) }';
		expect(build(sdl)).toThrow(
			/@authenticated on Query\.me: unknown type "staff" — known: session, token/,
		);
		expect(build(sdl, ['staff', 'patient'])).not.toThrow();
	});

	it('restrictions with no type in common', () => {
		expect(
			build(`
				type Note @authenticated(type: ["session"]) { body: String @authenticated(type: ["token"]) }
				type Query { note: Note }
			`),
		).toThrow(/@authenticated on Note\.body: .* have none in common/);
	});
});

describe("federation's @authenticated, which takes no argument", () => {
	it('is read as "any caller" in a subgraph that imports it', async () => {
		const subgraph = applyAuthenticated(
			buildSubgraphSchema([
				{
					typeDefs: parse(`
						extend schema @link(url: "https://specs.apollo.dev/federation/v2.5", import: ["@authenticated"])
						type Query { me: String @authenticated }
					`),
					resolvers: { Query: { me: () => 'me' } },
				},
			]),
		);
		expect(subgraph.getDirective('authenticated')?.args).toEqual([]);
		expect(codeOf(await run('{ me }', {}, subgraph))).toBe(
			ErrorCode.Unauthenticated,
		);
		expect((await run('{ me }', session, subgraph)).data).toEqual({ me: 'me' });
	});
});

describe('useAuthenticated beside useKetoChecks', () => {
	it('settles on one schema, whatever the order, and still guards the field', async () => {
		const typeDefs = [
			AUTHENTICATED_DIRECTIVE_SDL,
			KETO_DIRECTIVES_SDL,
			`type Query {
				note(id: ID!): String @authenticated(type: ["session"]) @permission(name: "view", type: "Note")
			}`,
		];
		const ory = {
			checkMany: async (q: unknown[]) => q.map(() => true),
		} as never;
		for (const plugins of [
			[useAuthenticated(), useKetoChecks(ory)],
			[useKetoChecks(ory), useAuthenticated()],
		]) {
			const yoga = createYoga({
				schema: createSchema({
					typeDefs,
					resolvers: { Query: { note: () => 'n' } },
				}),
				context: { ...token, ory: { kind: 'token', subject: 'client-1' } },
				plugins,
			});
			const response = await yoga.fetch(
				'http://api.test/graphql?query={note(id:"n1")}',
			);
			expect(response.status).toBe(403);
		}
	});
});
