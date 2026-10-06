import { describe, expect, it } from 'bun:test';
import { Hono, type MiddlewareHandler } from 'hono';
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

describe('unnamedOperations — HEAD', () => {
	it('counts a HEAD operation as named when a GET rule covers its path, as the guard does', () => {
		expect(
			unnamedOperations(policy(rest), [
				{ method: 'HEAD', path: '/things/:id' },
				{ method: 'HEAD', path: '/elsewhere' },
			]),
		).toEqual([{ method: 'HEAD', path: '/elsewhere' }]);
	});
});

describe('unnamedOperations — any-method routes', () => {
	it('reports an ALL route on an exact path that only some methods name', () => {
		// `app.all('/api/doc', …)` answers every method; a GET rule alone
		// leaves the others unnamed.
		expect(
			unnamedOperations(
				policy({ '/api/doc': { GET: { authenticated: true } } }),
				[{ method: 'ALL', path: '/api/doc' }],
			),
		).toEqual([{ method: 'ALL', path: '/api/doc' }]);
	});

	it('counts an ALL route as named when every method the schema knows is named', () => {
		const every = {
			GET: { authenticated: true },
			POST: { authenticated: true },
			PUT: { authenticated: true },
			PATCH: { authenticated: true },
			DELETE: { authenticated: true },
			OPTIONS: { authenticated: true },
			CONNECT: { authenticated: true },
			TRACE: { authenticated: true },
			QUERY: { authenticated: true },
		};
		// HEAD is named by the GET rule.
		expect(
			unnamedOperations(policy({ '/api/doc/:id': every }), [
				{ method: 'ALL', path: '/api/doc/:id' },
			]),
		).toEqual([]);
		const { TRACE: _omitted, ...allButTrace } = every;
		expect(
			unnamedOperations(policy({ '/api/doc/:id': allButTrace }), [
				{ method: 'ALL', path: '/api/doc/:id' },
			]),
		).toEqual([{ method: 'ALL', path: '/api/doc/:id' }]);
	});

	it('still skips an ALL route on a wildcard path, which is a middleware mount', () => {
		expect(
			unnamedOperations(policy({}), [{ method: 'ALL', path: '/api/*' }]),
		).toEqual([]);
	});
});

describe('unnamedOperations — exact-path middleware in a real route table', () => {
	const getOnly = policy({ '/api/doc': { GET: { authenticated: true } } });
	const mw: MiddlewareHandler = async (_c, next) => {
		await next();
	};

	it('skips a middleware mounted on an exact path in front of the route it guards', () => {
		const app = new Hono();
		app.use('/api/doc', mw);
		app.get('/api/doc', (c) => c.text('doc'));
		expect(unnamedOperations(getOnly, app.routes)).toEqual([]);
	});

	it('reports a middleware-shaped handler with nothing after it: it answers every method itself', () => {
		const app = new Hono();
		app.use('/api/doc', async (c, _next) => c.text('doc'));
		expect(unnamedOperations(getOnly, app.routes)).toEqual([
			{ method: 'ALL', path: '/api/doc' },
		]);
	});

	it('reports app.all alone', () => {
		const app = new Hono();
		app.all('/api/doc', (c) => c.text('doc'));
		expect(unnamedOperations(getOnly, app.routes)).toEqual([
			{ method: 'ALL', path: '/api/doc' },
		]);
	});

	it('reports app.all registered after a GET on the same path', () => {
		const app = new Hono();
		app.get('/api/doc', (c) => c.text('doc'));
		app.all('/api/doc', (c) => c.text('doc'));
		expect(unnamedOperations(getOnly, app.routes)).toEqual([
			{ method: 'ALL', path: '/api/doc' },
		]);
	});

	it('reports app.all registered before a GET on the same path: it is a handler, not middleware', () => {
		const app = new Hono();
		app.all('/api/doc', (c) => c.text('doc'));
		app.get('/api/doc', (c) => c.text('doc'));
		expect(unnamedOperations(getOnly, app.routes)).toEqual([
			{ method: 'ALL', path: '/api/doc' },
		]);
	});

	it('unwraps the handlers of a sub-app with its own onError, mounted through app.route()', () => {
		// `app.route()` wraps every handler of a sub-app that has an error
		// handler in a two-argument function, and keeps the original on
		// `__COMPOSED_HANDLER` — so every handler would look like middleware
		// unless it is unwrapped first.
		const sub = new Hono();
		sub.onError((_err, c) => c.text('error', 500));
		sub.use('/doc', mw);
		sub.get('/doc', (c) => c.text('doc'));
		sub.all('/report', (c) => c.text('report'));
		sub.get('/report', (c) => c.text('report'));
		const app = new Hono();
		app.route('/api', sub);

		expect(
			unnamedOperations(
				policy({
					'/api/doc': { GET: { authenticated: true } },
					'/api/report': { GET: { authenticated: true } },
				}),
				app.routes,
			),
		).toEqual([{ method: 'ALL', path: '/api/report' }]);
	});

	it('an entry without a handler keeps the every-method check', () => {
		expect(
			unnamedOperations(getOnly, [
				{ method: 'ALL', path: '/api/doc' },
				{ method: 'GET', path: '/api/doc' },
			]),
		).toEqual([{ method: 'ALL', path: '/api/doc' }]);
	});
});
