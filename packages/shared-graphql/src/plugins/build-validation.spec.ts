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

	it('the same typo in a @check term', () => {
		expect(
			build(`
				type Query {
					note: String @check(permissions: [[{ namespace: "Note", permit: "view" }]])
				}
			`),
		).toThrow(/@check on Query\.note: .*declares no arguments/);
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
