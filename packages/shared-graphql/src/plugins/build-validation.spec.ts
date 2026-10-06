import { describe, expect, it } from 'bun:test';
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
					b: String @permission(name: "view", type: "Owner", id: "source.ownerId")
				}
				type Query { note: Note }
			`),
		).not.toThrow();
	});
});

/**
 * `@check` was removed in 3.0. A schema that still declares it with 2.x's
 * `permissions` would otherwise boot with the field open.
 */
const CHECK_2X = `
	input CheckPermission { namespace: String!, permit: String!, id: String = "args.id" }
	enum CheckDenial { NOT_FOUND FORBIDDEN }
	directive @check(permissions: [[CheckPermission!]!]!, onDeny: CheckDenial! = NOT_FOUND, message: String) repeatable on FIELD_DEFINITION
`;

describe('applyKetoChecks refuses a removed @check', () => {
	it('on an object field, naming the field and the rewrite', () => {
		const attempt = build(`${CHECK_2X}
			type Query {
				note(id: ID!): String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
			}
		`);
		expect(attempt).toThrow(TypeError);
		expect(attempt).toThrow(
			/^@check on Query\.note: @check was removed in @nxgt\/shared-graphql 3\.0 — write one @permission/,
		);
	});

	it('on an interface field', () => {
		expect(
			build(`${CHECK_2X}
				interface Node {
					body(id: ID!): String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
				}
				type Note implements Node { body(id: ID!): String }
				type Query { node: Node }
			`),
		).toThrow(/@check on Node\.body: @check was removed/);
	});

	it('without its declaration, as graphql itself does', () => {
		expect(
			build(`
				type Query {
					note(id: ID!): String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
				}
			`),
		).toThrow(/Unknown directive "@check"/);
	});

	it('but leaves a @check of another shape to the schema that declared it', () => {
		expect(
			build(`
				directive @check(role: String) on FIELD_DEFINITION
				type Query { note: String @check(role: "ADMIN") }
			`),
		).not.toThrow();
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
		const resolve = schema.getQueryType()?.getFields()['note']?.resolve;
		expect(resolve?.(null, {}, {}, {} as never)).toBe('open');
	});
});
