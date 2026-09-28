import { describe, expect, it } from 'bun:test';
import { OryUnavailable, type Permission, tuple } from '@nxgt/ory-sdk';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { type ExecutionResult, graphql } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { KETO_DIRECTIVES_SDL } from '../directives';
import { denialMessageKey } from '../utils/errors/denial';
import { applyKetoChecks } from './apply-keto-checks';

/**
 * `@permission` answered by `applyKetoChecks`. The SDL is the string export,
 * which `sdl.spec.ts` holds equal to the shipped file.
 */
const SDL = `
type Note {
	id: ID!
	ownerId: ID!
	owner: Owner @permission(name: "view", type: "Owner", id: "parent.ownerId")
}
type Owner { id: ID! }

type Query {
	open: String
	note(id: ID!): Note @permission(name: "view", type: "Note")

	editable(id: ID!): Note
		@permission(name: "view", type: "Note")
		@permission(name: "edit", type: "Note", onDeny: FORBIDDEN)

	worded(id: ID!): Note
		@permission(name: "view", type: "Note", message: "notes.errors.not-found")
		@permission(name: "edit", type: "Note", onDeny: FORBIDDEN, message: "notes.errors.read-only")

	byKey(key: ID!): Note @permission(name: "view", type: "Note", id: "args.key")
	many(ids: [ID!]!): Note @permission(name: "edit", type: "Note", id: "args.ids")
}
`;

const byId = (_s: unknown, args: { id: string }) => ({
	id: args.id,
	ownerId: 'o1',
});

const schema = applyKetoChecks(
	createSchema({
		typeDefs: [KETO_DIRECTIVES_SDL, SDL],
		resolvers: {
			Query: {
				open: () => 'anyone',
				note: byId,
				editable: byId,
				worded: byId,
				byKey: (_s: unknown, args: { key: string }) => ({ id: args.key }),
				many: (_s: unknown, args: { ids: string[] }) => ({ id: args.ids[0] }),
			},
			Note: { owner: (note: { ownerId: string }) => ({ id: note.ownerId }) },
		},
	}),
);

/** Counts what reaches Keto, which is what the directive order decides. */
function signedIn(held: string[]) {
	const asked: string[] = [];
	const ketoChecks = async (permission: Permission, subject: string) => {
		const key = tuple(permission, subject);
		asked.push(key);
		return held.includes(key);
	};
	return { context: { ory: { subject: 'idn-7' }, ketoChecks }, asked };
}

/** The first error's code, and the i18n key it carries. */
function refusalOf(result: ExecutionResult) {
	const error = result.errors?.[0];
	return {
		code: error?.extensions?.code,
		key: denialMessageKey(error?.originalError),
	};
}

async function run(
	query: string,
	held: string[],
	variableValues?: Record<string, unknown>,
) {
	const { context, asked } = signedIn(held);
	const result = await graphql({
		schema,
		source: query,
		contextValue: context,
		variableValues,
	});
	return { result, asked, ...refusalOf(result) };
}

describe('@permission', () => {
	it('runs the resolver when the permit is held, reading args.id by default', async () => {
		const { result, asked } = await run('{ note(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(result.errors).toBeUndefined();
		expect(result.data?.note).toEqual({ id: 'n1' });
		expect(asked).toEqual(['Note:n1#view@idn-7']);
	});

	it('answers NOT_FOUND by default, so an id cannot be probed', async () => {
		const { code, key, result } = await run('{ note(id: "n1") { id } }', []);
		expect(code).toBe(ErrorCode.NotFound);
		expect(key).toBe('errors.not-found');
		expect(result.data?.note).toBeNull();
	});

	it('is AND when repeated, in declaration order: 404 for a stranger, 403 for a viewer', async () => {
		const stranger = await run('{ editable(id: "n1") { id } }', []);
		expect(stranger.code).toBe(ErrorCode.NotFound);
		expect(stranger.asked).toEqual(['Note:n1#view@idn-7']);

		const viewer = await run('{ editable(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(viewer.code).toBe(ErrorCode.Forbidden);
		expect(viewer.key).toBe('errors.insufficient-permissions');

		const owner = await run('{ editable(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
			'Note:n1#edit@idn-7',
		]);
		expect(owner.result.errors).toBeUndefined();
	});

	/**
	 * The two layers guarding one field have to word a refusal identically, or
	 * the wording alone tells the caller which one spoke — the difference
	 * NOT_FOUND exists to hide.
	 */
	it('carries the message the field names, on both rungs of the ladder', async () => {
		expect((await run('{ worded(id: "n1") { id } }', [])).key).toBe(
			'notes.errors.not-found',
		);
		const viewer = await run('{ worded(id: "n1") { id } }', [
			'Note:n1#view@idn-7',
		]);
		expect(viewer.key).toBe('notes.errors.read-only');
	});

	it('refuses an anonymous caller before asking Keto anything', async () => {
		const { context, asked } = signedIn(['Note:n1#view@idn-7']);
		const result = await graphql({
			schema,
			source: '{ note(id: "n1") { id } }',
			contextValue: { ...context, ory: null },
		});
		expect(refusalOf(result).code).toBe(ErrorCode.Unauthenticated);
		expect(asked).toHaveLength(0);
	});

	it('leaves a field without @permission alone', async () => {
		const result = await graphql({
			schema,
			source: '{ open }',
			contextValue: {},
		});
		expect(result.data?.open).toBe('anyone');
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

	it('requires the permit on every id of a list, stopping at the first refusal', async () => {
		const query = '{ many(ids: ["n1", "n2", "n3"]) { id } }';
		const partial = await run(query, [
			'Note:n1#edit@idn-7',
			'Note:n3#edit@idn-7',
		]);
		expect(partial.code).toBe(ErrorCode.NotFound);
		expect(partial.asked).toEqual(['Note:n1#edit@idn-7', 'Note:n2#edit@idn-7']);

		const all = await run(
			query,
			['n1', 'n2', 'n3'].map((n) => `Note:${n}#edit@idn-7`),
		);
		expect(all.result.errors).toBeUndefined();
	});

	it('refuses a path that resolves no object rather than allowing it', async () => {
		const { result } = await run(
			'query ($ids: [ID!]!) { many(ids: $ids) { id } }',
			['Note:n1#edit@idn-7'],
			{ ids: [] },
		);
		expect(result.errors?.[0]?.message).toMatch(/resolved no object id/);
	});

	it('lets an outage through, never as a denial', async () => {
		const result = await graphql({
			schema,
			source: '{ note(id: "n1") { id } }',
			contextValue: {
				ory: { subject: 'idn-7' },
				ketoChecks: async () => {
					throw new OryUnavailable('keto', 503, null);
				},
			},
		});
		expect(result.errors?.[0]?.originalError).toBeInstanceOf(OryUnavailable);
	});
});
