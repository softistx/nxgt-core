import { describe, expect, it } from 'bun:test';
import type { Permission, Subject } from '@nxgt/ory-sdk';
import {
	GraphQLID,
	GraphQLList,
	GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	graphql,
} from 'graphql';
import type { PolicyClaims } from '../../policy';
import { applyGraphqlPolicy } from '../../policy/graphql';
import { ketoPermissions } from './keto';

/**
 * A stub of the per-request `ketoChecks` loader `useKetoChecks(ory)`
 * publishes on the GraphQL context: it records every question in Keto's
 * `Namespace:object#relation@subject` notation and answers from `grants`.
 */
function recordingCheck(grants: string[]) {
	const asked: string[] = [];
	const ketoChecks = async (permission: Permission, subject: Subject) => {
		const who =
			typeof subject === 'string'
				? subject
				: `${subject.subjectSet.namespace}:${subject.subjectSet.object}#${subject.subjectSet.relation}`;
		const tuple = `${permission.namespace}:${permission.object}#${permission.relation}@${who}`;
		asked.push(tuple);
		return grants.includes(tuple);
	};
	return { asked, ketoChecks };
}

const noteType = new GraphQLObjectType({
	name: 'Note',
	fields: {
		id: { type: GraphQLID },
		body: { type: GraphQLString },
	},
});

const queryType = new GraphQLObjectType({
	name: 'Query',
	fields: {
		note: {
			type: noteType,
			args: { id: { type: new GraphQLNonNull(GraphQLID) } },
			resolve: (_, { id }) => ({ id, body: `body of ${id}` }),
		},
		notes: {
			type: new GraphQLList(noteType),
			args: { ids: { type: new GraphQLList(new GraphQLNonNull(GraphQLID)) } },
			resolve: (_, { ids }) =>
				(ids as string[]).map((id) => ({ id, body: `body of ${id}` })),
		},
		plain: { type: GraphQLString, resolve: () => 'plain' },
		open: { type: GraphQLString, resolve: () => 'open' },
	},
});

const rawSchema = new GraphQLSchema({ query: queryType });

const term = (permit: string, id = 'args.id', namespace = 'Note') => ({
	namespace,
	permit,
	id,
});

const rules = {
	graphql: {
		Query: {
			note: {
				keto: [
					{ permissions: [[term('view')]], message: 'notes.errors.not-found' },
				],
			},
			notes: { keto: [{ permissions: [[term('view', 'args.ids')]] }] },
			plain: { authenticated: true },
		},
		Note: {
			body: {
				keto: [
					{
						permissions: [
							[term('read-body', 'source.id')],
							[term('owner', 'source.id')],
						],
						onDeny: 'FORBIDDEN',
					},
				],
			},
		},
	},
};

const policed = applyGraphqlPolicy(rawSchema, rules, {
	getClaims: (ctx) =>
		((ctx as { claims?: PolicyClaims }).claims ?? {}) as PolicyClaims,
	permissions: ketoPermissions(),
});

/** The context `useOryAuth(ory)` + `useKetoChecks(ory)` would have built. */
function context(
	ketoChecks: ReturnType<typeof recordingCheck>['ketoChecks'] | undefined,
	subject: Subject | null = 'idn-7',
) {
	return {
		claims: { sub: 'idn-7' },
		ory: { subject },
		...(ketoChecks ? { ketoChecks } : {}),
	};
}

describe('ketoPermissions (GraphQL) — through applyGraphqlPolicy', () => {
	it('asks the loader with the object from args.<name> and ory.subject', async () => {
		const { asked, ketoChecks } = recordingCheck(['Note:n1#view@idn-7']);
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(ketoChecks),
		});
		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ note: { id: 'n1' } });
		expect(asked).toEqual(['Note:n1#view@idn-7']);
	});

	it('a refused rung is a NOT_FOUND error carrying its message, and the resolver never runs', async () => {
		const { asked, ketoChecks } = recordingCheck([]);
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(ketoChecks),
		});
		expect(result.data).toEqual({ note: null });
		expect(result.errors?.[0]?.message).toBe('notes.errors.not-found');
		expect(result.errors?.[0]?.extensions?.['code']).toBe('NOT_FOUND');
		expect(asked).toEqual(['Note:n1#view@idn-7']);
	});

	it('an args path naming a LIST requires the permit on every element', async () => {
		const { asked, ketoChecks } = recordingCheck([
			'Note:a#view@idn-7',
			'Note:b#view@idn-7',
		]);
		const ok = await graphql({
			schema: policed,
			source: '{ notes(ids: ["a", "b"]) { id } }',
			contextValue: context(ketoChecks),
		});
		expect(ok.errors).toBeUndefined();
		expect(asked).toEqual(['Note:a#view@idn-7', 'Note:b#view@idn-7']);

		asked.length = 0;
		const refused = await graphql({
			schema: policed,
			source: '{ notes(ids: ["a", "c", "b"]) { id } }',
			contextValue: context(ketoChecks),
		});
		expect(refused.errors?.[0]?.extensions?.['code']).toBe('NOT_FOUND');
		expect(refused.errors?.[0]?.message).toBe('errors.not-found');
		expect(asked).toEqual(['Note:a#view@idn-7', 'Note:c#view@idn-7']);
	});

	it('reads source.<name> on a field of a returned type, OR across groups, FORBIDDEN with the default message', async () => {
		const { asked, ketoChecks } = recordingCheck([
			'Note:n1#view@idn-7',
			'Note:n1#owner@idn-7',
		]);
		const ok = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { body } }',
			contextValue: context(ketoChecks),
		});
		expect(ok.errors).toBeUndefined();
		expect(ok.data).toEqual({ note: { body: 'body of n1' } });
		expect(asked).toEqual([
			'Note:n1#view@idn-7',
			'Note:n1#read-body@idn-7',
			'Note:n1#owner@idn-7',
		]);

		const viewer = recordingCheck(['Note:n1#view@idn-7']);
		const refused = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id body } }',
			contextValue: context(viewer.ketoChecks),
		});
		expect(refused.data).toEqual({ note: { id: 'n1', body: null } });
		expect(refused.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN');
		expect(refused.errors?.[0]?.message).toBe(
			'errors.insufficient-permissions',
		);
	});

	it('passes a subject set through unchanged', async () => {
		const { asked, ketoChecks } = recordingCheck([
			'Note:n1#view@Group:eng#members',
		]);
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(ketoChecks, {
				subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
			}),
		});
		expect(result.errors).toBeUndefined();
		expect(asked).toEqual(['Note:n1#view@Group:eng#members']);
	});

	it('no ory.subject is UNAUTHENTICATED and asks nothing', async () => {
		const { asked, ketoChecks } = recordingCheck([]);
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(ketoChecks, null),
		});
		expect(result.errors?.[0]?.extensions?.['code']).toBe('UNAUTHENTICATED');
		expect(asked).toEqual([]);
	});

	it('a field no rule names is never wrapped, so it never needs the loader', async () => {
		const result = await graphql({
			schema: policed,
			source: '{ open }',
			contextValue: context(undefined),
		});
		expect(result.errors).toBeUndefined();
		expect(result.data).toEqual({ open: 'open' });
	});
});

describe('ketoPermissions (GraphQL) — error paths', () => {
	it('without useKetoChecks, a rule carrying keto fails with the wiring error', async () => {
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(undefined),
		});
		expect(result.data).toEqual({ note: null });
		expect(result.errors?.[0]?.message).toContain(
			'useKetoChecks(ory) is not registered on this server',
		);
	});

	it('a null context is read as an empty one and fails with the same wiring error', async () => {
		const schema = applyGraphqlPolicy(rawSchema, rules, {
			getClaims: () => ({ sub: 'idn-7' }),
			permissions: ketoPermissions(),
		});
		const result = await graphql({
			schema,
			source: '{ note(id: "n1") { id } }',
			contextValue: null,
		});
		expect(result.errors?.[0]?.message).toContain(
			'a rule carries a `keto` check',
		);
	});

	it('without useKetoChecks, a policed field with no keto term still resolves', async () => {
		// The provider is called only for a field whose rule carries a `keto`
		// term; `plain` asks only for a signed-in caller.
		const result = await graphql({
			schema: policed,
			source: '{ plain note(id: "n1") { id } }',
			contextValue: context(undefined),
		});
		expect(result.data).toEqual({ plain: 'plain', note: null });
		expect(result.errors).toHaveLength(1);
		expect(result.errors?.[0]?.path).toEqual(['note']);
		expect(result.errors?.[0]?.message).toContain(
			'useKetoChecks(ory) is not registered on this server',
		);
	});

	it('with useKetoChecks, a policed field with no keto term never touches the loader', async () => {
		const { asked, ketoChecks } = recordingCheck([]);
		const result = await graphql({
			schema: policed,
			source: '{ plain }',
			contextValue: context(ketoChecks),
		});
		expect(result.data).toEqual({ plain: 'plain' });
		expect(asked).toEqual([]);
	});

	it('a loader that rejects fails the field, never resolves it', async () => {
		const result = await graphql({
			schema: policed,
			source: '{ note(id: "n1") { id } }',
			contextValue: context(async () => {
				throw new Error('keto unreachable');
			}),
		});
		expect(result.data).toEqual({ note: null });
		expect(result.errors?.[0]?.message).toBe('keto unreachable');
	});
});
