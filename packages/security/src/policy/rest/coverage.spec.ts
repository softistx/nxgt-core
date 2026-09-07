import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../compile';
import type { Rules } from '../rules.schema';
import { openapiOperations, unnamedOperations } from './coverage';

const policy = (rest: Rules['rest'], basePath?: string) =>
	compilePolicy({ global: basePath ? { basePath } : undefined, rest } as Rules);

const rest: Rules['rest'] = {
	'/things': { GET: { authenticated: true }, POST: { authenticated: true } },
	'/things/:id': { GET: { authenticated: true } },
};

describe('unnamedOperations', () => {
	it('is empty when every operation has a rule', () => {
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'GET', path: '/things' },
				{ method: 'POST', path: '/things' },
				{ method: 'GET', path: '/things/:id' },
			]),
		).toEqual([]);
	});

	it('names an operation no rule covers', () => {
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'GET', path: '/things/:id/share' },
			]),
		).toEqual([{ method: 'GET', path: '/things/:id/share' }]);
	});

	it('catches a METHOD the file forgot on a path it does name', () => {
		// The one a reader's eye skips: `/things/:id` is in the file, `DELETE`
		// is not, and routes are partitioned by method.
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'DELETE', path: '/things/:id' },
			]),
		).toEqual([{ method: 'DELETE', path: '/things/:id' }]);
	});

	it('reads `{id}` and `:id` as the same operation', () => {
		// One source writes each: an OpenAPI document and a route table.
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'GET', path: '/things/{id}' },
				{ method: 'GET', path: '/things/:id' },
			]),
		).toEqual([]);
	});

	it('does not let a literal segment swallow a placeholder', () => {
		// `/users/me` sits before `/users/:id` on purpose in real documents. A
		// placeholder that could BE a literal would report `/users/{id}` as
		// covered by the `/users/me` rule.
		expect(
			unnamedOperations(
				policy({ '/users/me': { GET: { authenticated: true } } }),
				[{ method: 'GET', path: '/users/{id}' }],
			),
		).toEqual([{ method: 'GET', path: '/users/{id}' }]);
	});

	it('skips the wildcard mounts a route table is full of', () => {
		// `app.use('/api/*', policyGuard(...))` registers as ALL on a wildcard.
		// Demanding a rule for the guard itself would be absurd.
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'ALL', path: '/api/*' },
				{ method: 'GET', path: '/*' },
			]),
		).toEqual([]);
	});

	it('skips what is mounted outside the guard', () => {
		const withBase = policy(rest, '/api');
		expect(
			unnamedOperations(
				withBase,
				[
					{ method: 'GET', path: '/health' },
					{ method: 'GET', path: '/api/things' },
				],
				{ mountedOn: '/api' },
			),
		).toEqual([]);
	});

	it('collapses the duplicates a route table carries', () => {
		// Hono registers one entry per middleware in the chain, so the same
		// method and path appear several times.
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'GET', path: '/things/:id/share' },
				{ method: 'GET', path: '/things/:id/share' },
			]),
		).toHaveLength(1);
	});

	it('honours `ignore`', () => {
		expect(
			unnamedOperations(policy(rest), [{ method: 'GET', path: '/metrics' }], {
				ignore: (op) => op.path === '/metrics',
			}),
		).toEqual([]);
	});
});

describe('openapiOperations', () => {
	it('prepends the prefix the document leaves out', () => {
		expect(
			openapiOperations({ '/things': { get: {} } }, { prefix: '/api' }),
		).toEqual([{ method: 'GET', path: '/api/things' }]);
	});

	it('skips the keys OpenAPI puts beside operations', () => {
		expect(
			openapiOperations({
				'/things': { get: {}, post: {}, parameters: [], summary: 'Things' },
			}),
		).toHaveLength(2);
	});

	it('feeds unnamedOperations', () => {
		const withBase = policy(rest, '/api');
		expect(
			unnamedOperations(
				withBase,
				openapiOperations(
					{ '/things': { get: {} }, '/things/{id}/share': { get: {} } },
					{ prefix: '/api' },
				),
			),
		).toEqual([{ method: 'GET', path: '/api/things/{id}/share' }]);
	});
});
