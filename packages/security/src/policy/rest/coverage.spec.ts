import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../compile';
import type { Rules } from '../rules.schema';
import { unnamedOperations } from './coverage';

const policy = (rest: Rules['rest'], basePath?: string) =>
	compilePolicy({ global: basePath ? { basePath } : undefined, rest } as Rules);

describe('unnamedOperations', () => {
	const rest: Rules['rest'] = {
		'/things': { GET: { authenticated: true }, POST: { authenticated: true } },
		'/things/:id': { GET: { authenticated: true } },
	};

	it('is empty when every published operation has a rule', () => {
		expect(
			unnamedOperations(policy(rest), {
				'/things': { get: {}, post: {} },
				'/things/{id}': { get: {} },
			}),
		).toEqual([]);
	});

	it('names an operation no rule covers', () => {
		expect(
			unnamedOperations(policy(rest), { '/things/{id}/share': { get: {} } }),
		).toEqual([{ method: 'GET', path: '/things/{id}/share' }]);
	});

	it('catches a METHOD the file forgot on a path it does name', () => {
		// The one a reader's eye skips: `/things/:id` is in the file, `DELETE`
		// is not, and routes are partitioned by method.
		expect(
			unnamedOperations(policy(rest), { '/things/{id}': { delete: {} } }),
		).toEqual([{ method: 'DELETE', path: '/things/{id}' }]);
	});

	it('prepends the basePath the OpenAPI document leaves out', () => {
		const withBase = policy(rest, '/api');
		expect(
			unnamedOperations(
				withBase,
				{ '/things': { get: {} } },
				{
					basePath: '/api',
				},
			),
		).toEqual([]);
		// Without it, nothing matches — which is the failure mode to recognise:
		// EVERY operation reported missing means the prefix is wrong, not that
		// the file is empty.
		expect(
			unnamedOperations(withBase, { '/things': { get: {} } }),
		).toHaveLength(1);
	});

	it('skips the keys OpenAPI puts beside operations', () => {
		expect(
			unnamedOperations(policy(rest), {
				'/things': { get: {}, post: {}, parameters: [], summary: 'Things' },
			}),
		).toEqual([]);
	});

	it('honours `ignore`, for what is mounted before the guard', () => {
		expect(
			unnamedOperations(
				policy(rest),
				{ '/health': { get: {} } },
				{ ignore: (op) => op.path === '/health' },
			),
		).toEqual([]);
	});

	it('does not let a literal segment swallow a placeholder', () => {
		// `/users/me` sits before `/users/:id` on purpose in real documents.
		// Substituting a value that could BE a literal would report `/users/{id}`
		// as covered by the `/users/me` rule.
		const users = policy({ '/users/me': { GET: { authenticated: true } } });
		expect(unnamedOperations(users, { '/users/{id}': { get: {} } })).toEqual([
			{ method: 'GET', path: '/users/{id}' },
		]);
	});
});
