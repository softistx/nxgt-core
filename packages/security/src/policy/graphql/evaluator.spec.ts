import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../compile';
import type { PermissionEvaluator } from '../permissions.types';
import type { Rules } from '../rules.schema';
import { evaluateGraphql } from './evaluator';

/**
 * A stand-in for `evaluateRequirement` bound to a Keto loader: it walks the
 * same DNF (outer OR, inner AND) and records every question, so a test can
 * assert both the answer and what it cost.
 */
function fakeKeto(granted: string[]) {
	const asked: string[] = [];
	const evaluatePermissions: PermissionEvaluator = async (
		requirement,
		objectsOf,
		subject,
	) => {
		for (const group of requirement) {
			let all = true;
			for (const term of group) {
				for (const object of objectsOf(term)) {
					const q = `${term.namespace}:${object}#${term.permit}@${subject}`;
					asked.push(q);
					if (!granted.includes(q)) all = false;
				}
			}
			if (all) return true;
		}
		return false;
	};
	return { asked, evaluatePermissions };
}

/** The ladder `@check` writes by being repeatable, said declaratively. */
const LADDER: Rules = {
	graphql: {
		Query: {
			note: {
				keto: [
					{
						permissions: [
							[{ namespace: 'Note', permit: 'view', id: 'args.id' }],
						],
						onDeny: 'NOT_FOUND',
						message: 'notes.errors.not-found',
					},
				],
			},
		},
		Mutation: {
			updateNote: {
				keto: [
					{
						permissions: [
							[{ namespace: 'Note', permit: 'view', id: 'args.id' }],
						],
						onDeny: 'NOT_FOUND',
						message: 'notes.errors.not-found',
					},
					{
						permissions: [
							[{ namespace: 'Note', permit: 'edit', id: 'args.id' }],
						],
						onDeny: 'FORBIDDEN',
					},
				],
			},
		},
	},
};

describe('evaluateGraphql — the 404-then-403 ladder', () => {
	const policy = compilePolicy(LADDER);

	const update = (granted: string[]) => {
		const keto = fakeKeto(granted);
		return {
			keto,
			result: evaluateGraphql(
				policy,
				{
					type: 'graphql',
					operationType: 'Mutation',
					field: 'updateNote',
					claims: { sub: 'idn-7' },
					args: { id: 'n1' },
				},
				{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
			),
		};
	};

	it('tells a stranger the note is not there', async () => {
		expect(await update([]).result).toMatchObject({
			decision: 'DENY',
			denial: 'NOT_FOUND',
			message: 'notes.errors.not-found',
		});
	});

	it('tells a viewer who tries to write that they may not', async () => {
		expect(await update(['Note:n1#view@idn-7']).result).toMatchObject({
			decision: 'DENY',
			denial: 'FORBIDDEN',
			// No `message` on that rung, so the shared key `@check` falls back to.
			message: 'errors.insufficient-permissions',
		});
	});

	it('lets an editor through', async () => {
		const { result } = update(['Note:n1#view@idn-7', 'Note:n1#edit@idn-7']);
		expect((await result).decision).toBe('ALLOW');
	});

	it('stops at the first rung that refuses, and does not ask the second', async () => {
		const { keto, result } = update([]);
		await result;
		expect(keto.asked).toEqual(['Note:n1#view@idn-7']);
	});
});

describe('evaluateGraphql — what a Keto term costs, and when', () => {
	it('refuses an anonymous caller before spending a round trip', async () => {
		const keto = fakeKeto([]);
		const result = await evaluateGraphql(
			compilePolicy(LADDER),
			{
				type: 'graphql',
				operationType: 'Query',
				field: 'note',
				claims: {} as any,
				args: { id: 'n1' },
			},
			{ evaluatePermissions: keto.evaluatePermissions, subject: null },
		);

		expect(result.decision).toBe('UNAUTHENTICATED');
		expect(keto.asked).toHaveLength(0);
	});

	it('checks authorities before spending a round trip', async () => {
		const keto = fakeKeto([]);
		const policy = compilePolicy({
			graphql: {
				Query: {
					note: {
						authorities: [['ADMIN']],
						keto: [
							{
								permissions: [
									[{ namespace: 'Note', permit: 'view', id: 'args.id' }],
								],
								onDeny: 'NOT_FOUND',
							},
						],
					},
				},
			},
		} as Rules);

		const result = await evaluateGraphql(
			policy,
			{
				type: 'graphql',
				operationType: 'Query',
				field: 'note',
				claims: { sub: 'idn-7', authorities: [] },
				args: { id: 'n1' },
			},
			{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
		);

		// An authority refusal, so no `denial` — it answers what it always did.
		expect(result.decision).toBe('DENY');
		expect(result.denial).toBeUndefined();
		expect(keto.asked).toHaveLength(0);
	});

	it('throws, rather than allowing, when no permission evaluator was supplied', async () => {
		expect(
			evaluateGraphql(compilePolicy(LADDER), {
				type: 'graphql',
				operationType: 'Query',
				field: 'note',
				claims: { sub: 'idn-7' },
				args: { id: 'n1' },
			}),
		).rejects.toThrow(/no permission evaluator was supplied/);
	});
});

describe('evaluateGraphql — where an object id comes from', () => {
	const run = async (id: string, input: Record<string, unknown>) => {
		const keto = fakeKeto([]);
		const policy = compilePolicy({
			graphql: {
				Query: {
					thing: {
						keto: [
							{
								permissions: [[{ namespace: 'Thing', permit: 'view', id }]],
								onDeny: 'NOT_FOUND',
							},
						],
					},
				},
			},
		} as Rules);
		const result = await evaluateGraphql(
			policy,
			{
				type: 'graphql',
				operationType: 'Query',
				field: 'thing',
				claims: { sub: 'idn-7' },
				...input,
			},
			{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
		);
		return { asked: keto.asked, result };
	};

	it('reads a dotted `args.` path', async () => {
		const { asked } = await run('args.input.thingId', {
			args: { input: { thingId: 't1' } },
		});
		expect(asked).toEqual(['Thing:t1#view@idn-7']);
	});

	it('reads `source.`, which is how a field on a returned type names its object', async () => {
		const { asked } = await run('source.id', { source: { id: 't9' } });
		expect(asked).toEqual(['Thing:t9#view@idn-7']);
	});

	it('requires the permit on every id when the path resolves a list', async () => {
		const { asked, result } = await run('args.ids', {
			args: { ids: ['a', 'b'] },
		});
		expect(asked).toEqual(['Thing:a#view@idn-7', 'Thing:b#view@idn-7']);
		expect(result.decision).toBe('DENY');
	});

	it('throws rather than denying when the path resolves no id', async () => {
		expect(run('args.missing', { args: {} })).rejects.toThrow(
			/resolved no object id/,
		);
	});
});

describe('compilePolicy — a public GraphQL field cannot ask Keto anything', () => {
	it('refuses `public` and `keto` on the same field', () => {
		expect(() =>
			compilePolicy({
				graphql: {
					Query: {
						sharedNote: {
							public: true,
							keto: [
								{
									permissions: [
										[{ namespace: 'Note', permit: 'view', id: 'args.token' }],
									],
									onDeny: 'NOT_FOUND',
								},
							],
						},
					},
				},
			} as Rules),
		).toThrow(/contradictory/);
	});
});
