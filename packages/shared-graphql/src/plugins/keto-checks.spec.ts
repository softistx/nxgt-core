import { describe, expect, it } from 'bun:test';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { graphql } from 'graphql';
import { createSchema } from 'graphql-yoga';
import { type Ory, OryUnavailable, type Permission, tuple } from 'stx-sdk/ory';
import { applyKetoChecks, createKetoChecks } from './keto-checks';

/**
 * The SDL under test is the one that SHIPS — `graphql/directives/check.graphqls`,
 * the file `SHARED_SCHEMA_PATH` globs — so a change that breaks its syntax or
 * its defaults fails here rather than in the first consumer that loads it.
 */
const CHECK_SDL = await Bun.file(
	new URL('../../graphql/directives/check.graphqls', import.meta.url),
).text();

const SDL = `
type Note { id: ID! }

type Query {
	open: String
	note(id: ID!): Note
		@check(permissions: [[{ namespace: "Note", permit: "view" }]])

	editable(id: ID!): Note
		@check(permissions: [[{ namespace: "Note", permit: "view" }]])
		@check(permissions: [[{ namespace: "Note", permit: "edit" }]], onDeny: FORBIDDEN)

	either(id: ID!): Note
		@check(permissions: [
			[{ namespace: "Note", permit: "a" }, { namespace: "Note", permit: "b" }],
			[{ namespace: "Note", permit: "c" }]
		])

	many(ids: [ID!]!): Note
		@check(permissions: [[{ namespace: "Note", permit: "edit", id: "args.ids" }]])

	worded(id: ID!): Note
		@check(
			permissions: [[{ namespace: "Note", permit: "view" }]]
			message: "notes.errors.not-found"
		)
		@check(
			permissions: [[{ namespace: "Note", permit: "edit" }]]
			onDeny: FORBIDDEN
			message: "notes.errors.read-only"
		)
}
`;

const RESOLVERS = {
	Query: {
		open: () => 'anyone',
		note: (_s: unknown, args: { id: string }) => ({ id: args.id }),
		editable: (_s: unknown, args: { id: string }) => ({ id: args.id }),
		either: (_s: unknown, args: { id: string }) => ({ id: args.id }),
		many: (_s: unknown, args: { ids: string[] }) => ({ id: args.ids[0] }),
		worded: (_s: unknown, args: { id: string }) => ({ id: args.id }),
	},
};

type Resolvers = NonNullable<Parameters<typeof createSchema>[0]['resolvers']>;

function schemaOf(sdl = SDL, resolvers: Resolvers = RESOLVERS) {
	return applyKetoChecks(
		createSchema({ typeDefs: [CHECK_SDL, sdl], resolvers }),
	);
}

/** Counts what reaches Keto, which is what the cache claims to reduce. */
function checker(held: string[]) {
	const asked: string[] = [];
	const ketoChecks = async (permission: Permission, subject: string) => {
		const key = tuple(permission, subject);
		asked.push(key);
		return held.includes(key);
	};
	return { ketoChecks, asked };
}

const run = (
	query: string,
	context: Record<string, unknown>,
	variableValues?: Record<string, unknown>,
) =>
	graphql({
		schema: schemaOf(),
		source: query,
		contextValue: context,
		variableValues,
	});

const signedIn = (held: string[]) => {
	const { ketoChecks, asked } = checker(held);
	return { context: { ory: { subject: 'idn-7' }, ketoChecks }, asked };
};

const errorCodeOf = (result: Awaited<ReturnType<typeof graphql>>) =>
	(result.errors?.[0]?.originalError as { errorCode?: string } | undefined)
		?.errorCode;

/** The i18n key, before `createMaskError(translate)` turns it into a sentence. */
const messageKeyOf = (result: Awaited<ReturnType<typeof graphql>>) =>
	result.errors?.[0]?.originalError?.message;

describe('@check', () => {
	it('runs the resolver when the permission holds', async () => {
		const { context } = signedIn(['Note:n1#view@idn-7']);
		const result = await run('{ note(id: "n1") { id } }', context);

		expect(result.errors).toBeUndefined();
		expect(result.data?.note).toEqual({ id: 'n1' });
	});

	it('answers NOT_FOUND by default, so an id cannot be probed', async () => {
		const { context } = signedIn([]);
		const result = await run('{ note(id: "n1") { id } }', context);

		expect(errorCodeOf(result)).toBe(ErrorCode.NotFound);
		expect(result.data?.note).toBeNull();
	});

	it('walks the checks in order: 404 for a stranger, 403 for a viewer', async () => {
		const stranger = signedIn([]);
		expect(
			errorCodeOf(await run('{ editable(id: "n1") { id } }', stranger.context)),
		).toBe(ErrorCode.NotFound);

		const viewer = signedIn(['Note:n1#view@idn-7']);
		expect(
			errorCodeOf(await run('{ editable(id: "n1") { id } }', viewer.context)),
		).toBe(ErrorCode.Forbidden);

		const owner = signedIn(['Note:n1#view@idn-7', 'Note:n1#edit@idn-7']);
		expect(
			(await run('{ editable(id: "n1") { id } }', owner.context)).errors,
		).toBeUndefined();
	});

	/**
	 * The two layers guarding one field have to word a refusal identically. If
	 * the directive says "Could not find the requested resource." where the
	 * service says "Note not found.", the wording alone tells the caller which
	 * one spoke — which is the difference NOT_FOUND exists to hide.
	 */
	it('carries the message the field names, on both rungs of the ladder', async () => {
		const stranger = signedIn([]);
		const hidden = await run('{ worded(id: "n1") { id } }', stranger.context);
		expect(errorCodeOf(hidden)).toBe(ErrorCode.NotFound);
		expect(messageKeyOf(hidden)).toBe('notes.errors.not-found');

		const viewer = signedIn(['Note:n1#view@idn-7']);
		const refused = await run('{ worded(id: "n1") { id } }', viewer.context);
		expect(errorCodeOf(refused)).toBe(ErrorCode.Forbidden);
		expect(messageKeyOf(refused)).toBe('notes.errors.read-only');
	});

	it('falls back to the shared errors.* keys when the field says nothing', async () => {
		const stranger = signedIn([]);
		expect(
			messageKeyOf(await run('{ note(id: "n1") { id } }', stranger.context)),
		).toBe('errors.not-found');

		const viewer = signedIn(['Note:n1#view@idn-7']);
		expect(
			messageKeyOf(await run('{ editable(id: "n1") { id } }', viewer.context)),
		).toBe('errors.insufficient-permissions');
	});

	it('refuses an anonymous caller before asking Keto anything', async () => {
		const { ketoChecks, asked } = checker(['Note:n1#view@idn-7']);
		const result = await run('{ note(id: "n1") { id } }', {
			ory: null,
			ketoChecks,
		});

		expect(errorCodeOf(result)).toBe(ErrorCode.Unauthenticated);
		expect(asked).toHaveLength(0);
	});

	it('leaves a field without @check alone', async () => {
		const result = await run('{ open }', { ory: null });
		expect(result.data?.open).toBe('anyone');
	});

	it.each([
		{ held: ['a'], allowed: false },
		{ held: ['a', 'b'], allowed: true },
		{ held: ['c'], allowed: true },
		{ held: [], allowed: false },
	])(
		'reads [[A, B], [C]] as (A and B) or C — $held',
		async ({ held, allowed }) => {
			const { context } = signedIn(held.map((p) => `Note:n1#${p}@idn-7`));
			const result = await run('{ either(id: "n1") { id } }', context);

			expect(result.errors === undefined).toBe(allowed);
		},
	);

	it('requires the permit on every id of a list argument', async () => {
		const { context, asked } = signedIn([
			'Note:n1#edit@idn-7',
			'Note:n3#edit@idn-7',
		]);
		const result = await run(
			'{ many(ids: ["n1", "n2", "n3"]) { id } }',
			context,
		);

		expect(errorCodeOf(result)).toBe(ErrorCode.NotFound);
		// n2 denied, so n3 is never asked.
		expect(asked).toEqual(['Note:n1#edit@idn-7', 'Note:n2#edit@idn-7']);
	});

	it('lets an id the caller does not hold fail even among ones they do', async () => {
		const { context } = signedIn([
			'Note:n1#edit@idn-7',
			'Note:n2#edit@idn-7',
			'Note:n3#edit@idn-7',
		]);
		const result = await run(
			'{ many(ids: ["n1", "n2", "n3"]) { id } }',
			context,
		);

		expect(result.errors).toBeUndefined();
	});

	it('refuses a term that resolves no object rather than allowing it', async () => {
		const { context } = signedIn(['Note:n1#view@idn-7']);
		const result = await graphql({
			schema: schemaOf(),
			source: 'query ($ids: [ID!]!) { many(ids: $ids) { id } }',
			contextValue: context,
			variableValues: { ids: [] },
		});

		expect(result.errors?.[0]?.message).toMatch(/resolved no object id/);
	});

	it('lets an Ory outage through as an outage, never as a denial', async () => {
		const ketoChecks = async () => {
			throw new OryUnavailable('keto', 503, null);
		};
		const result = await run('{ note(id: "n1") { id } }', {
			ory: { subject: 'idn-7' },
			ketoChecks,
		});

		expect(result.errors?.[0]?.originalError).toBeInstanceOf(OryUnavailable);
		expect(errorCodeOf(result)).toBeUndefined();
	});
});

describe('applyKetoChecks, at build time', () => {
	it('refuses a path naming neither args nor source', () => {
		expect(() =>
			schemaOf(
				`
				type Query {
					bad(id: ID!): String
						@check(permissions: [[{ namespace: "N", permit: "view", id: "bogus" }]])
				}
			`,
				{},
			),
		).toThrow(/must be "args\.<path>" or "source\.<path>"/);
	});

	it('refuses an empty group, which would admit everyone', () => {
		expect(() =>
			schemaOf(
				`
				type Query {
					wide(id: ID!): String @check(permissions: [[]])
				}
			`,
				{},
			),
		).toThrow(/admits EVERYONE/);
	});
});

describe('createKetoChecks', () => {
	function fakeOry(held: string[]) {
		const batches: number[] = [];
		const ory = {
			checkMany: async (
				questions: { permission: Permission; subject: string }[],
			) => {
				batches.push(questions.length);
				return questions.map(({ permission, subject }) =>
					held.includes(tuple(permission, subject)),
				);
			},
		} as unknown as Ory;
		return { ory, batches };
	}

	const view: Permission = {
		namespace: 'Note',
		object: 'n1',
		relation: 'view',
	};
	const edit: Permission = {
		namespace: 'Note',
		object: 'n1',
		relation: 'edit',
	};

	it('asks the same question once, however many times it is asked', async () => {
		const { ory, batches } = fakeOry(['Note:n1#view@idn-7']);
		const check = createKetoChecks(ory);

		const answers = await Promise.all([
			check(view, 'idn-7'),
			check(view, 'idn-7'),
		]);

		expect(answers).toEqual([true, true]);
		expect(batches).toEqual([1]);
	});

	it('sends distinct questions of one tick as a single batch', async () => {
		const { ory, batches } = fakeOry(['Note:n1#view@idn-7']);
		const check = createKetoChecks(ory);

		expect(
			await Promise.all([check(view, 'idn-7'), check(edit, 'idn-7')]),
		).toEqual([true, false]);
		expect(batches).toEqual([2]);
	});

	it('keeps its answers for the life of the request', async () => {
		const { ory, batches } = fakeOry([]);
		const check = createKetoChecks(ory);

		await check(view, 'idn-7');
		await check(view, 'idn-7');

		expect(batches).toEqual([1]);
	});
});
