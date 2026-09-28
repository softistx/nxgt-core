import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '@nxgt/shared-exceptions';
import {
	type ExecutionResult,
	GraphQLScalarType,
	graphql,
	parse,
	subscribe,
} from 'graphql';
import { createSchema } from 'graphql-yoga';
import { AUTHENTICATED_DIRECTIVE_SDL } from '../directives';
import { buildSubgraphSchema } from '../utils/schema.utils';
import { applyAuthenticated } from './apply-authenticated';

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

describe('@authenticated on what a field returns, and on a subscription', () => {
	const guarded = applyAuthenticated(
		createSchema({
			typeDefs: [
				AUTHENTICATED_DIRECTIVE_SDL,
				`scalar Secret @authenticated
				enum Level @authenticated(type: ["session"]) { LOW HIGH }
				type Query { secret: Secret, level: Level }
				type Subscription { tick: Int @authenticated }`,
			],
			resolvers: {
				Secret: new GraphQLScalarType({ name: 'Secret' }),
				Query: { secret: () => 'classified', level: () => 'HIGH' },
				Subscription: {
					tick: {
						subscribe: () => {
							opened += 1;
							return (async function* () {
								yield { tick: 1 };
							})();
						},
					},
				},
			},
		}),
	);
	let opened = 0;

	it('guards every field returning a guarded scalar or enum', async () => {
		const anonymous = await run('{ secret level }', {}, guarded);
		expect(anonymous.data).toEqual({ secret: null, level: null });
		expect(anonymous.errors?.map((e) => e.extensions.code)).toEqual([
			ErrorCode.Unauthenticated,
			ErrorCode.Unauthenticated,
		]);
		expect(codeOf(await run('{ level }', token, guarded))).toBe(
			ErrorCode.Forbidden,
		);
		expect((await run('{ secret level }', session, guarded)).data).toEqual({
			secret: 'classified',
			level: 'HIGH',
		});
	});

	it('refuses a subscription before its stream is opened', async () => {
		const refused = await subscribe({
			schema: guarded,
			document: parse('subscription { tick }'),
			contextValue: {},
		});
		expect((refused as ExecutionResult).errors?.[0]?.extensions?.code).toBe(
			ErrorCode.Unauthenticated,
		);
		expect(opened).toBe(0);

		const stream = await subscribe({
			schema: guarded,
			document: parse('subscription { tick }'),
			contextValue: session,
		});
		const first = await (stream as AsyncGenerator<ExecutionResult>).next();
		expect(first.value?.data).toEqual({ tick: 1 });
		expect(opened).toBe(1);
	});
});
