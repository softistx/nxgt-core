import { describe, expect, it } from 'bun:test';
import { type Permission, tuple } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { graphql } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { KETO_DIRECTIVES_SDL } from '../directives';
import { applyKetoChecks } from './apply-keto-checks';

/**
 * `@permission` — the flat form — answered by the same transform as `@check`,
 * and interleaved with it in declaration order. The SDL is the string export,
 * which `sdl.spec.ts` holds equal to the shipped files.
 */
const SDL = `
type Note {
	id: ID!
	ownerId: ID!
	owner: Owner @permission(name: "view", type: "Owner", id: "parent.ownerId")
}
type Owner { id: ID! }

type Query {
	note(id: ID!): Note @permission(name: "view", type: "Note")

	editable(id: ID!): Note
		@permission(name: "view", type: "Note")
		@permission(name: "edit", type: "Note", onDeny: FORBIDDEN, message: "notes.errors.read-only")

	mixed(id: ID!): Note
		@check(permissions: [[{ namespace: "Note", permit: "view" }]])
		@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)

	byKey(key: ID!): Note @permission(name: "view", type: "Note", id: "args.key")
}
`;

function schemaOf() {
	return applyKetoChecks(
		createSchema({
			typeDefs: [KETO_DIRECTIVES_SDL, SDL],
			resolvers: {
				Query: {
					note: (_s: unknown, args: { id?: string }) => ({
						id: args.id ?? 'n1',
						ownerId: 'o1',
					}),
					editable: (_s: unknown, args: { id: string }) => ({ id: args.id }),
					mixed: (_s: unknown, args: { id: string }) => ({ id: args.id }),
					byKey: (_s: unknown, args: { key: string }) => ({ id: args.key }),
				},
				Note: { owner: (note: { ownerId: string }) => ({ id: note.ownerId }) },
			},
		}),
	);
}

function signedIn(held: string[]) {
	const asked: string[] = [];
	const ketoChecks = async (permission: Permission, subject: string) => {
		const key = tuple(permission, subject);
		asked.push(key);
		return held.includes(key);
	};
	return { context: { ory: { subject: 'idn-7' }, ketoChecks }, asked };
}

async function run(query: string, held: string[]) {
	const { context, asked } = signedIn(held);
	const result = await graphql({
		schema: schemaOf(),
		source: query,
		contextValue: context,
	});
	const error = result.errors?.[0]?.originalError as
		| { errorCode?: string; message?: string }
		| undefined;
	return { result, asked, code: error?.errorCode, key: error?.message };
}

describe('@permission', () => {
	it('runs the resolver when the permit is held, reading args.id by default', async () => {
		const { result, asked } = await run('{ note(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(result.errors).toBeUndefined();
		expect(asked).toEqual(['Note:n1#view@idn-7']);
	});

	it('answers NOT_FOUND by default', async () => {
		const { code, key } = await run('{ note(id: "n1") { id } }', []);
		expect(code).toBe(ErrorCode.NotFound);
		expect(key).toBe('errors.not-found');
	});

	it('is AND when repeated, in declaration order: 404, then 403 with its message', async () => {
		expect((await run('{ editable(id: "n1") { id } }', [])).code).toBe(
			ErrorCode.NotFound,
		);

		const viewer = await run('{ editable(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(viewer.code).toBe(ErrorCode.Forbidden);
		expect(viewer.key).toBe('notes.errors.read-only');

		const owner = await run('{ editable(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
			'Note:n1#edit@idn-7',
		]);
		expect(owner.result.errors).toBeUndefined();
	});

	it('keeps declaration order across @check and @permission', async () => {
		const stranger = await run('{ mixed(id: "n1") { id } }', []);
		expect(stranger.code).toBe(ErrorCode.NotFound);
		expect(stranger.asked).toEqual(['Note:n1#view@idn-7']);

		const viewer = await run('{ mixed(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(viewer.code).toBe(ErrorCode.Forbidden);
	});

	it('reads the id where `id` points: another argument', async () => {
		const { asked } = await run('{ byKey(key: "n9") { id } }', []);
		expect(asked).toEqual(['Note:n9#view@idn-7']);
	});

	it('reads the id where `id` points: the parent object', async () => {
		const { result, asked } = await run('{ note(id: "n1") { owner { id } } }', [
			'Note:n1#view@idn-7',
			'Owner:o1#view@idn-7',
		]);
		expect(result.errors).toBeUndefined();
		expect(asked).toEqual(['Note:n1#view@idn-7', 'Owner:o1#view@idn-7']);
	});
});
