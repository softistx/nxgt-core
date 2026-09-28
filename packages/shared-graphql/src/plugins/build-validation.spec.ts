import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import { logger } from '@nxgt/shared-logging';
import { createSchema } from 'graphql-yoga';
import { KETO_DIRECTIVES_SDL } from '../directives';
import { applyKetoChecks } from './apply-keto-checks';

/**
 * Everything a requirement can get wrong without a request is refused when
 * the schema is transformed — a `TypeError` naming `Type.field`, so the server
 * does not boot — rather than on the one query nobody tried.
 */
function build(sdl: string, namespaces?: string[]) {
	return () =>
		applyKetoChecks(
			createSchema({ typeDefs: [KETO_DIRECTIVES_SDL, sdl] }),
			namespaces ? { namespaces } : {},
		);
}

describe('applyKetoChecks refuses at build', () => {
	it('a path naming no root, as a TypeError naming the field', () => {
		const attempt = build(`
			type Query { note(id: ID!): String @permission(name: "view", type: "Note", id: "id") }
		`);
		expect(attempt).toThrow(TypeError);
		expect(attempt).toThrow(/@permission on Query\.note: `id` must be/);
	});

	it('an argument the field does not declare', () => {
		expect(
			build(`
				type Query { note(noteId: ID!): String @permission(name: "view", type: "Note") }
			`),
		).toThrow(
			/Query\.note: `id` reads "args\.id", but the field declares noteId/,
		);
	});

	it('a namespace outside the model, when the model is given', () => {
		const sdl = `
			type Query { note(id: ID!): String @permission(name: "view", type: "Noet") }
		`;
		expect(build(sdl, ['Note', 'Folder'])).toThrow(
			/Query\.note: unknown namespace "Noet" — known: Note, Folder/,
		);
		// Without the model, a namespace is taken on trust, as before.
		expect(build(sdl)).not.toThrow();
	});

	it('a guard on an interface field, which no resolver runs through', () => {
		expect(
			build(`
				interface Node { id(id: ID!): ID! @permission(name: "view", type: "Note") }
				type Note implements Node { id(id: ID!): ID! }
				type Query { node: Node }
			`),
		).toThrow(/Node\.id: .*interface field guards nothing/);
	});

	it('accepts parent.<path> and source.<path> as the same root', () => {
		expect(
			build(`
				type Note {
					ownerId: ID!
					a: String @permission(name: "view", type: "Owner", id: "parent.ownerId")
					b: String @check(permissions: [[{ namespace: "Owner", permit: "view", id: "source.ownerId" }]])
				}
				type Query { note: Note }
			`),
		).not.toThrow();
	});
});

/**
 * `@check` booted in 2.x with the same two mistakes. It still does — with a
 * warning naming the field — so this minor stops no server that ran before.
 */
describe('applyKetoChecks warns, for @check alone', () => {
	const warn = spyOn(logger, 'warn').mockImplementation(() => logger);
	afterEach(() => warn.mockClear());
	afterAll(() => warn.mockRestore());
	const warned = () => warn.mock.calls.map(([message]) => String(message));

	it('an argument the field does not declare', () => {
		expect(
			build(`
				type Query {
					note: String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
				}
			`),
		).not.toThrow();
		expect(warned()).toEqual([
			expect.stringMatching(
				/^@check on Query\.note: .*declares no arguments — @check still boots/,
			),
		]);
	});

	it('a guard on an interface field', () => {
		expect(
			build(`
				interface Node {
					body(id: ID!): String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
				}
				type Note implements Node { body(id: ID!): String }
				type Query { node: Node }
			`),
		).not.toThrow();
		expect(warned()).toEqual([
			expect.stringMatching(/^Node\.body: .*interface field guards nothing/),
		]);
	});
	it('a malformed @check on an interface field, which 2.x never read', () => {
		expect(
			build(`
				interface Node {
					body(id: ID!): String @check(permissions: [[{ namespace: "Note", permit: "view", id: "id" }]])
				}
				type Note implements Node { body(id: ID!): String }
				type Query { node: Node }
			`),
		).not.toThrow();
		expect(warned()).toEqual([
			expect.stringMatching(/^Node\.body: .*interface field guards nothing/),
		]);
	});
});

describe('a @permission of another shape', () => {
	it('is left to the schema that declared it', () => {
		const schema = applyKetoChecks(
			createSchema({
				typeDefs: `
					directive @permission(requires: String) on FIELD_DEFINITION
					type Query { note: String @permission(requires: "ADMIN") }
				`,
				resolvers: { Query: { note: () => 'open' } },
			}),
		);
		const resolve = schema.getQueryType()?.getFields().note?.resolve;
		expect(resolve?.(null, {}, {}, {} as never)).toBe('open');
	});
});
