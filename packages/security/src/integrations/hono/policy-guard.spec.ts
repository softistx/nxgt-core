import { describe, expect, it } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { PermissionEvaluator, PolicySubject } from '../../policy';
import { type PolicyGuardOptions, policyGuard } from './policy-guard';

/**
 * Every spec here goes through a real Hono app and `app.request`. The two
 * things the app needs from outside the guard are stood in for by the
 * smallest real middleware that does the same job:
 *
 * - a token resolver: `Authorization: Bearer <sub>` puts `{ sub }` on the
 *   `USER_HEADERS.CLAIMS` context variable, which is what `bearerAuth` /
 *   `currentUser` / `oryAuth` do with a verified token;
 * - an error handler that answers a `CustomException` with its `code`, which
 *   is what `@nxgt/shared-hono`'s handler does.
 */
function appWith(rules: unknown, options?: PolicyGuardOptions) {
	const app = new Hono();
	const reached: { method: string; path: string; body?: unknown }[] = [];

	app.onError((err, c) => {
		if (err instanceof CustomException) {
			return c.json(
				{ message: err.message, debugMessage: err.debugMessage },
				err.code as ContentfulStatusCode,
			);
		}
		return c.json({ error: err.message }, 500);
	});

	app.use('*', async (c, next) => {
		const auth = c.req.header('authorization');
		if (auth?.startsWith('Bearer ')) {
			const token = auth.slice('Bearer '.length);
			c.set(
				USER_HEADERS.CLAIMS as never,
				(token.startsWith('client:')
					? { clientId: token.slice('client:'.length) }
					: { sub: token, authorities: ['USER'] }) as never,
			);
		}
		await next();
	});

	app.use('/api/*', policyGuard(rules, options));

	app.all('/api/*', async (c) => {
		const body =
			c.req.header('content-type')?.includes('application/json') &&
			c.req.method !== 'GET' &&
			c.req.method !== 'HEAD'
				? await c.req.json().catch(() => 'unreadable')
				: undefined;
		reached.push({ method: c.req.method, path: c.req.path, body });
		return c.json({ ok: true, body });
	});

	return { app, reached };
}

const bearer = (sub: string) => ({ authorization: `Bearer ${sub}` });

/**
 * The guard on every path, fixed claims, and a handler that answers with what
 * Hono's own helpers read — for comparing the guard's view with the app's.
 */
function bareApp(rules: unknown, claims?: Record<string, unknown>) {
	const app = new Hono();
	app.onError((err, c) =>
		err instanceof CustomException
			? c.json({}, err.code as ContentfulStatusCode)
			: c.json({ error: err.message }, 500),
	);
	if (claims) {
		app.use('*', async (c, next) => {
			c.set(USER_HEADERS.CLAIMS as never, claims as never);
			await next();
		});
	}
	app.use('*', policyGuard(rules));
	app.all('*', (c) => c.json({ cookies: getCookie(c), query: c.req.query() }));
	return app;
}

describe('policyGuard — decisions and status codes', () => {
	const rules = {
		rest: {
			'/api/me': { GET: { authenticated: true } },
			'/api/admin': { GET: { authorities: [['ADMIN']] } },
			'/api/shared/:token': { GET: { public: true } },
			'/api/guarded': {
				GET: {
					expression: {
						value: "claims.sub === 'alice'",
						message: 'only alice',
					},
				},
			},
		},
	};

	it('ALLOW passes through to the handler', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/me', { headers: bearer('alice') });
		expect(res.status).toBe(200);
		expect(reached).toHaveLength(1);
	});

	it('UNAUTHENTICATED answers 401 and never reaches the handler', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/me');
		expect(res.status).toBe(401);
		expect(await res.json()).toMatchObject({
			message: 'errors.unauthenticated',
			debugMessage: 'GET /api/me requires an authenticated caller',
		});
		expect(reached).toHaveLength(0);
	});

	it('DENY on authorities answers 403 errors.forbidden', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/admin', { headers: bearer('alice') });
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ message: 'errors.forbidden' });
		expect(reached).toHaveLength(0);
	});

	it('an anonymous caller on a rule with authorities is 401, not 403', async () => {
		const { app } = appWith(rules);
		expect((await app.request('/api/admin')).status).toBe(401);
	});

	it('a `public` rule admits an anonymous caller', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/shared/abc');
		expect(res.status).toBe(200);
		expect(reached).toHaveLength(1);
	});

	it('DENY on an expression answers 403 and keeps its message as debugMessage only', async () => {
		// Pinned: the expression's `message` reaches `debugMessage`, never
		// `message` — the guard only surfaces `result.message`, which an
		// expression refusal does not set.
		const { app } = appWith(rules);
		const bob = await app.request('/api/guarded', { headers: bearer('bob') });
		expect(bob.status).toBe(403);
		expect(await bob.json()).toEqual({
			message: 'errors.forbidden',
			debugMessage: 'only alice',
		});
		const alice = await app.request('/api/guarded', {
			headers: bearer('alice'),
		});
		expect(alice.status).toBe(200);
	});

	it('NOT_APPLICABLE is open: a path no rule names passes, anonymous too', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/unnamed');
		expect(res.status).toBe(200);
		expect(reached).toEqual([{ method: 'GET', path: '/api/unnamed' }]);
	});

	describe('global.unmatched: deny', () => {
		const closed = {
			global: { unmatched: 'deny' },
			rest: { '/api/me': { GET: { authenticated: true } } },
		};

		it('answers 401 to an anonymous caller on an unnamed path', async () => {
			const { app } = appWith(closed);
			expect((await app.request('/api/unnamed')).status).toBe(401);
		});

		it('answers 403 to an authenticated caller on an unnamed path', async () => {
			const { app } = appWith(closed);
			const res = await app.request('/api/unnamed', {
				headers: bearer('alice'),
			});
			expect(res.status).toBe(403);
		});

		it('still allows a named path', async () => {
			const { app } = appWith(closed);
			const res = await app.request('/api/me', { headers: bearer('alice') });
			expect(res.status).toBe(200);
		});
	});
});

describe('policyGuard — rule matching', () => {
	const rules = {
		rest: {
			'/api/items': {
				GET: { public: true },
				POST: { authorities: [['ADMIN']] },
			},
			'/api/items/special': { GET: { authorities: [['ADMIN']] } },
			'/api/items/:id': {
				GET: { expression: { value: "req.params.id !== 'x'" } },
			},
			'/api/files/*rest': { GET: { authorities: [['ADMIN']] } },
			'/api/d/:domain/things': { GET: { authorities: [['$domain:read']] } },
		},
	};

	it('matches on the method: the same path answers per method', async () => {
		const { app } = appWith(rules);
		expect((await app.request('/api/items')).status).toBe(200);
		expect(
			(
				await app.request('/api/items', {
					method: 'POST',
					headers: bearer('alice'),
				})
			).status,
		).toBe(403);
	});

	it('a method the path does not name is NOT_APPLICABLE, so open', async () => {
		const { app, reached } = appWith(rules);
		const res = await app.request('/api/items', { method: 'DELETE' });
		expect(res.status).toBe(200);
		expect(reached).toHaveLength(1);
	});

	it('first match wins in document order: a literal declared first beats a later :param', async () => {
		const { app } = appWith(rules);
		// `/api/items/special` is declared before `/api/items/:id`, so its
		// ADMIN requirement applies rather than the expression.
		expect(
			(await app.request('/api/items/special', { headers: bearer('alice') }))
				.status,
		).toBe(403);
	});

	it('captures :params from the rules-file pattern into req.params', async () => {
		const { app } = appWith(rules);
		expect(
			(await app.request('/api/items/a', { headers: bearer('alice') })).status,
		).toBe(200);
		expect(
			(await app.request('/api/items/x', { headers: bearer('alice') })).status,
		).toBe(403);
	});

	it('a wildcard pattern covers every depth below it', async () => {
		const { app } = appWith(rules);
		for (const path of ['/api/files/a', '/api/files/a/b/c']) {
			expect(
				(await app.request(path, { headers: bearer('alice') })).status,
			).toBe(403);
		}
	});

	it('a wildcard needs at least one segment: the bare prefix is not matched', async () => {
		// Pinned: path-to-regexp v8 `*rest` matches one or more characters, so
		// `/api/files` itself is NOT_APPLICABLE and open.
		const { app } = appWith(rules);
		expect((await app.request('/api/files')).status).toBe(200);
	});

	it('matches a trailing slash and is case-insensitive (path-to-regexp defaults)', async () => {
		const app = bareApp(
			{ rest: { '/admin': { GET: { authorities: [['ADMIN']] } } } },
			{ sub: 'alice' },
		);
		expect((await app.request('/admin/')).status).toBe(403);
		expect((await app.request('/ADMIN')).status).toBe(403);
	});

	it('substitutes $domain from the path into authorities, per request', async () => {
		const app = bareApp(
			{
				rest: {
					'/d/:domain/things': { GET: { authorities: [['$domain:read']] } },
				},
			},
			{ sub: 'alice', authorities: ['acme:read'] },
		);
		expect((await app.request('/d/acme/things')).status).toBe(200);
		expect((await app.request('/d/other/things')).status).toBe(403);
		// …and the first request's domain was not baked into the compiled rule.
		expect((await app.request('/d/acme/things')).status).toBe(200);
	});

	it('prefixes every pattern with global.basePath', async () => {
		const { app } = appWith({
			global: { basePath: '/api' },
			rest: { '/me': { GET: { authenticated: true } } },
		});
		expect((await app.request('/api/me')).status).toBe(401);
	});

	describe('HEAD', () => {
		// Hono answers HEAD by running the GET route while `ctx.req.method`
		// stays `HEAD`, so a HEAD request faces the GET rule, and its own HEAD
		// rule as well when one matches: both must allow it.
		const getOnly = {
			rest: {
				'/api/me': { GET: { authenticated: true } },
				'/api/admin': { GET: { authorities: [['ADMIN']] } },
			},
		};

		it('an anonymous HEAD on a GET-only authenticated route is 401, and the handler never runs', async () => {
			const { app, reached } = appWith(getOnly);
			const res = await app.request('/api/me', { method: 'HEAD' });
			expect(res.status).toBe(401);
			expect(reached).toEqual([]);
		});

		it('a HEAD the GET rule refuses is 403', async () => {
			const { app, reached } = appWith(getOnly);
			const res = await app.request('/api/admin', {
				method: 'HEAD',
				headers: bearer('alice'),
			});
			expect(res.status).toBe(403);
			expect(reached).toEqual([]);
		});

		it('a HEAD from an authorized caller is still 200', async () => {
			const { app, reached } = appWith(getOnly);
			const res = await app.request('/api/me', {
				method: 'HEAD',
				headers: bearer('alice'),
			});
			expect(res.status).toBe(200);
			expect(reached).toEqual([{ method: 'HEAD', path: '/api/me' }]);
		});

		it('a HEAD rule and the GET rule must both allow', async () => {
			const { app, reached } = appWith({
				rest: {
					'/api/status': {
						HEAD: { public: true },
						GET: { authenticated: true },
					},
				},
			});
			expect(
				(await app.request('/api/status', { method: 'HEAD' })).status,
			).toBe(401);
			expect(reached).toEqual([]);
			expect(
				(
					await app.request('/api/status', {
						method: 'HEAD',
						headers: bearer('alice'),
					})
				).status,
			).toBe(200);
		});

		it('a HEAD rule can restrict the GET rule', async () => {
			const { app } = appWith({
				rest: {
					'/api/status': {
						HEAD: { authorities: [['ADMIN']] },
						GET: { authenticated: true },
					},
				},
			});
			const head = await app.request('/api/status', {
				method: 'HEAD',
				headers: bearer('alice'),
			});
			expect(head.status).toBe(403);
			expect(
				(await app.request('/api/status', { headers: bearer('alice') })).status,
			).toBe(200);
		});

		it('under unmatched: deny, HEAD on a path with only a HEAD rule is refused as GET is', async () => {
			const rules = (unmatched: 'allow' | 'deny') => ({
				global: { unmatched },
				rest: { '/api/doc': { HEAD: { authenticated: true } } },
			});
			const closed = appWith(rules('deny'));
			for (const method of ['HEAD', 'GET']) {
				const res = await closed.app.request('/api/doc', {
					method,
					headers: bearer('alice'),
				});
				expect(res.status).toBe(403);
			}
			expect(closed.reached).toEqual([]);

			const open = appWith(rules('allow'));
			expect(
				(
					await open.app.request('/api/doc', {
						method: 'HEAD',
						headers: bearer('alice'),
					})
				).status,
			).toBe(200);
		});

		it('a HEAD rule that refuses refuses, whatever the GET rule says', async () => {
			const { app, reached } = appWith({
				rest: {
					'/api/doc': {
						HEAD: { authorities: [['ADMIN']] },
						GET: { public: true },
					},
				},
			});
			expect(
				(
					await app.request('/api/doc', {
						method: 'HEAD',
						headers: bearer('alice'),
					})
				).status,
			).toBe(403);
			expect((await app.request('/api/doc')).status).toBe(200);
			expect(reached).toEqual([{ method: 'GET', path: '/api/doc' }]);
		});

		it('a HEAD rule on another path does not hide the GET rule on this one', async () => {
			const { app } = appWith({
				rest: {
					'/api/ping': { HEAD: { public: true } },
					'/api/me': { GET: { authenticated: true } },
				},
			});
			expect((await app.request('/api/ping', { method: 'HEAD' })).status).toBe(
				200,
			);
			expect((await app.request('/api/me', { method: 'HEAD' })).status).toBe(
				401,
			);
		});

		it('a path that names neither HEAD nor GET is still NOT_APPLICABLE for HEAD', async () => {
			const { app } = appWith({
				rest: { '/api/items': { POST: { authenticated: true } } },
			});
			expect((await app.request('/api/items', { method: 'HEAD' })).status).toBe(
				200,
			);
		});
	});

	it('matches the still-encoded path and decodes the capture once, as Hono does', async () => {
		// Hono leaves `/items/%2561` encoded in `ctx.req.path` and hands the
		// handler `%61`; the guard's matcher decodes once too, so both rails see
		// the same id.
		const { app } = appWith({
			rest: {
				'/api/items/:id': {
					GET: {
						public: true,
						expression: { value: "req.params.id === '%61'" },
					},
				},
			},
		});
		expect((await app.request('/api/items/%2561')).status).toBe(200);
	});
});

describe('policyGuard — where the caller and the request come from', () => {
	it('the token: a caller named by `sub` is authenticated', async () => {
		const { app } = appWith({
			rest: { '/api/me': { GET: { authenticated: true } } },
		});
		expect(
			(await app.request('/api/me', { headers: bearer('alice') })).status,
		).toBe(200);
	});

	it('the token: a confidential client named by `clientId` alone is authenticated', async () => {
		const { app } = appWith({
			rest: { '/api/me': { GET: { authenticated: true } } },
		});
		expect(
			(await app.request('/api/me', { headers: bearer('client:svc-1') }))
				.status,
		).toBe(200);
	});

	it('a header: claims the client writes in X-Claims / X-User-* are never read', async () => {
		const { app } = appWith({
			rest: { '/api/me': { GET: { authenticated: true } } },
		});
		const res = await app.request('/api/me', {
			headers: {
				[USER_HEADERS.CLAIMS]: JSON.stringify({ sub: 'mallory' }),
				'x-user-id': 'mallory',
			},
		});
		expect(res.status).toBe(401);
	});

	it('a header: an expression on req.headers reads what the client wrote', async () => {
		// The README's "things that bite": a header in an expression is no
		// proof of who sent it.
		const { app } = appWith({
			rest: {
				'/api/me': {
					GET: { expression: { value: "req.headers['x-tenant'] === 'acme'" } },
				},
			},
		});
		const ok = await app.request('/api/me', {
			headers: { ...bearer('alice'), 'x-tenant': 'acme' },
		});
		expect(ok.status).toBe(200);
		const no = await app.request('/api/me', {
			headers: { ...bearer('alice'), 'x-tenant': 'other' },
		});
		expect(no.status).toBe(403);
	});

	it('a cookie: an expression on req.cookies sees the named cookie', async () => {
		const { app } = appWith({
			rest: {
				'/api/me': {
					GET: { expression: { value: "req.cookies.session === 'abc'" } },
				},
			},
		});
		const ok = await app.request('/api/me', {
			headers: { ...bearer('alice'), cookie: 'theme=dark; session=abc' },
		});
		expect(ok.status).toBe(200);
		const no = await app.request('/api/me', {
			headers: { ...bearer('alice'), cookie: 'session=xyz' },
		});
		expect(no.status).toBe(403);
		const none = await app.request('/api/me', { headers: bearer('alice') });
		expect(none.status).toBe(403);
	});

	it('a cookie: the guard reads the decoded value, as getCookie does', async () => {
		const app = bareApp({
			rest: {
				'/decoded': {
					GET: {
						public: true,
						expression: { value: "req.cookies.name === 'a b'" },
					},
				},
				'/raw': {
					GET: {
						public: true,
						expression: { value: "req.cookies.name === 'a%20b'" },
					},
				},
			},
		});

		const decoded = await app.request('/decoded', {
			headers: { cookie: 'name=a%20b' },
		});
		expect(decoded.status).toBe(200);
		expect((await decoded.json()).cookies).toEqual({ name: 'a b' });
		expect(
			(await app.request('/raw', { headers: { cookie: 'name=a%20b' } })).status,
		).toBe(403);
	});

	it('a cookie: quotes are stripped and a repeated name keeps the first value, as getCookie does', async () => {
		const app = bareApp({
			rest: {
				'/': {
					GET: {
						public: true,
						expression: {
							value: `req.cookies.q === 'v' && req.cookies.a === 'first'`,
						},
					},
				},
			},
		});
		const res = await app.request('/', {
			headers: { cookie: 'q="v"; a=first; a=second; novalue; =orphan' },
		});
		expect(res.status).toBe(200);
		expect((await res.json()).cookies).toEqual({ q: 'v', a: 'first' });
	});

	it('a cookie: a repeated name is checked on its first value, the one getCookie returns', async () => {
		const app = bareApp({
			rest: {
				'/': {
					GET: {
						public: true,
						expression: { value: "req.cookies.org === 'mine'" },
					},
				},
			},
		});
		const res = await app.request('/', {
			headers: { cookie: 'org=other; org=mine' },
		});
		expect(res.status).toBe(403);
	});

	it('the query: the guard reads the first of a repeated parameter, as c.req.query() does', async () => {
		const app = bareApp(
			{
				rest: {
					'/q': {
						GET: { expression: { value: "req.query.org === 'mine'" } },
					},
				},
			},
			{ sub: 'alice' },
		);
		const refused = await app.request('/q?org=other&org=mine');
		expect(refused.status).toBe(403);

		const allowed = await app.request('/q?org=mine&org=other');
		expect(allowed.status).toBe(200);
		expect((await allowed.json()).query).toEqual({ org: 'mine' });
	});

	it('the query: a parameter is decoded once, as c.req.query() does', async () => {
		const app = bareApp(
			{
				rest: {
					'/q': {
						GET: { expression: { value: "req.query.name === 'a b&c'" } },
					},
				},
			},
			{ sub: 'alice' },
		);
		const res = await app.request('/q?name=a%20b%26c');
		expect(res.status).toBe(200);
		expect((await res.json()).query).toEqual({ name: 'a b&c' });
	});

	it('the body: a JSON body reaches req.body and is still readable by the handler', async () => {
		const { app, reached } = appWith({
			rest: {
				'/api/items': {
					POST: { expression: { value: "req.body.name === 'ok'" } },
				},
			},
		});
		const res = await app.request('/api/items', {
			method: 'POST',
			headers: { ...bearer('alice'), 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'ok' }),
		});
		expect(res.status).toBe(200);
		expect(reached[0]?.body).toEqual({ name: 'ok' });

		const refused = await app.request('/api/items', {
			method: 'POST',
			headers: { ...bearer('alice'), 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'no' }),
		});
		expect(refused.status).toBe(403);
	});

	it('the body: the raw request stream is still readable downstream', async () => {
		const app = new Hono();
		app.use('*', policyGuard({}));
		app.post('*', async (c) => c.json(await c.req.raw.json()));
		const res = await app.request('/', {
			method: 'POST',
			headers: { 'content-type': 'application/json; charset=utf-8' },
			body: JSON.stringify({ a: 1 }),
		});
		expect(await res.json()).toEqual({ a: 1 });
	});

	it('the body: the handler reads the exact bytes sent, through c.req.text() and c.req.raw', async () => {
		// What a signature check needs: the guard's parse must not hand the
		// handler a re-serialised body.
		const app = new Hono();
		app.use('*', policyGuard({}));
		app.post('*', async (c) =>
			c.json({ text: await c.req.text(), raw: await c.req.raw.text() }),
		);
		const sent = '{ "a" : 1,  "b":"x" }';
		const res = await app.request('/', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: sent,
		});
		expect(await res.json()).toEqual({ text: sent, raw: sent });
	});

	it.each([
		['application/merge-patch+json'],
		['application/vnd.api+json; charset=utf-8'],
		['Application/JSON; charset=UTF-8'],
	])(
		'the body: %s is parsed as JSON, as Hono’s validator detects it',
		async (contentType) => {
			const { app } = appWith({
				rest: {
					'/api/items': {
						PATCH: { expression: { value: "req.body?.name === 'ok'" } },
					},
				},
			});
			const res = await app.request('/api/items', {
				method: 'PATCH',
				headers: { ...bearer('alice'), 'content-type': contentType },
				body: JSON.stringify({ name: 'ok' }),
			});
			expect(res.status).toBe(200);
		},
	);

	it.each([['text/plain; application/json'], ['application/jsonx']])(
		'the body: %s is not JSON, as Hono’s validator decides',
		async (contentType) => {
			const { app } = appWith({
				rest: {
					'/api/items': {
						POST: { expression: { value: 'req.body === undefined' } },
					},
				},
			});
			const res = await app.request('/api/items', {
				method: 'POST',
				headers: { ...bearer('alice'), 'content-type': contentType },
				body: JSON.stringify({ name: 'ok' }),
			});
			expect(res.status).toBe(200);
		},
	);

	it('the body: malformed JSON leaves req.body undefined, so an expression on it denies', async () => {
		const { app } = appWith({
			rest: {
				'/api/items': {
					POST: { expression: { value: 'req.body === undefined' } },
				},
			},
		});
		const res = await app.request('/api/items', {
			method: 'POST',
			headers: { ...bearer('alice'), 'content-type': 'application/json' },
			body: '{not json',
		});
		expect(res.status).toBe(200);
	});

	it('the body: a non-JSON content type is never parsed', async () => {
		const { app } = appWith({
			rest: {
				'/api/items': {
					POST: { expression: { value: 'req.body === undefined' } },
				},
			},
		});
		const res = await app.request('/api/items', {
			method: 'POST',
			headers: { ...bearer('alice'), 'content-type': 'text/plain' },
			body: '{"name":"ok"}',
		});
		expect(res.status).toBe(200);
	});
});

describe('policyGuard — keto through a permissions provider', () => {
	/** A stub evaluator that records every term it is asked and answers per term. */
	function recordingPermissions(
		answer: (namespace: string, permit: string, id: string) => boolean,
		subject: PolicySubject | null = 'idn-7',
	) {
		const asked: string[] = [];
		const evaluatePermissions: PermissionEvaluator = async (
			requirement,
			objectsOf,
			who,
		) => {
			for (const group of requirement) {
				let all = true;
				for (const term of group) {
					for (const id of objectsOf(term)) {
						asked.push(`${term.namespace}:${id}#${term.permit}@${String(who)}`);
						if (!answer(term.namespace, term.permit, id)) all = false;
					}
				}
				if (all) return true;
			}
			return false;
		};
		return {
			asked,
			options: {
				permissions: () => ({ subject, evaluatePermissions }),
			} satisfies PolicyGuardOptions,
		};
	}

	const ladder = {
		rest: {
			'/api/bookmarks/:id': {
				PATCH: {
					keto: [
						{
							permissions: [
								[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
							],
							message: 'bookmarks.errors.not-found',
						},
						{
							permissions: [
								[{ namespace: 'Bookmark', permit: 'edit', id: 'param.id' }],
							],
							onDeny: 'FORBIDDEN',
						},
					],
				},
			},
		},
	};

	it('a NOT_FOUND rung answers 404 with its message', async () => {
		const { asked, options } = recordingPermissions(() => false);
		const { app, reached } = appWith(ladder, options);
		const res = await app.request('/api/bookmarks/b1', {
			method: 'PATCH',
			headers: bearer('alice'),
		});
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({
			message: 'bookmarks.errors.not-found',
		});
		expect(asked).toEqual(['Bookmark:b1#view@idn-7']);
		expect(reached).toHaveLength(0);
	});

	it('a FORBIDDEN rung answers 403 with the default message', async () => {
		const { asked, options } = recordingPermissions(
			(_, permit) => permit === 'view',
		);
		const { app } = appWith(ladder, options);
		const res = await app.request('/api/bookmarks/b1', {
			method: 'PATCH',
			headers: bearer('alice'),
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({
			message: 'errors.insufficient-permissions',
		});
		expect(asked).toEqual(['Bookmark:b1#view@idn-7', 'Bookmark:b1#edit@idn-7']);
	});

	it('every rung passing is ALLOW', async () => {
		const { options } = recordingPermissions(() => true);
		const { app, reached } = appWith(ladder, options);
		const res = await app.request('/api/bookmarks/b1', {
			method: 'PATCH',
			headers: bearer('alice'),
		});
		expect(res.status).toBe(200);
		expect(reached).toHaveLength(1);
	});

	it('the keto rungs run only after the floor and authorities: an anonymous caller is never asked about', async () => {
		const { asked, options } = recordingPermissions(() => true);
		const { app } = appWith(ladder, options);
		const res = await app.request('/api/bookmarks/b1', { method: 'PATCH' });
		expect(res.status).toBe(401);
		expect(asked).toEqual([]);
	});

	it('an authenticated caller with no Keto subject is 401', async () => {
		const { asked, options } = recordingPermissions(() => true, null);
		const { app } = appWith(ladder, options);
		const res = await app.request('/api/bookmarks/b1', {
			method: 'PATCH',
			headers: bearer('alice'),
		});
		expect(res.status).toBe(401);
		expect(asked).toEqual([]);
	});

	it('a rule with a keto term and no provider throws — never an allow', async () => {
		const { app, reached } = appWith(ladder);
		const res = await app.request('/api/bookmarks/b1', {
			method: 'PATCH',
			headers: bearer('alice'),
		});
		expect(res.status).toBe(500);
		expect((await res.json()).error).toContain(
			'declares a `keto` check, but no permission evaluator was supplied',
		);
		expect(reached).toHaveLength(0);
	});
});

describe('policyGuard — the permissions provider is called lazily', () => {
	function countingProvider() {
		const calls: string[] = [];
		const options: PolicyGuardOptions = {
			permissions: (ctx) => {
				calls.push(`${ctx.req.method} ${ctx.req.path}`);
				return { subject: 'idn-7', evaluatePermissions: async () => true };
			},
		};
		return { calls, options };
	}

	const rules = {
		rest: {
			'/api/plain': { GET: { authenticated: true } },
			'/api/bookmarks/:id': {
				GET: {
					keto: [
						{
							permissions: [
								[{ namespace: 'B', permit: 'view', id: 'param.id' }],
							],
						},
						{
							permissions: [
								[{ namespace: 'B', permit: 'edit', id: 'param.id' }],
							],
						},
					],
				},
			},
		},
	};

	it('is not called for a rule with no keto term, nor for a path no rule names', async () => {
		const { calls, options } = countingProvider();
		const { app } = appWith(rules, options);
		expect(
			(await app.request('/api/plain', { headers: bearer('alice') })).status,
		).toBe(200);
		expect((await app.request('/api/unnamed')).status).toBe(200);
		expect(calls).toEqual([]);
	});

	it('is not called when the floor refuses before the keto rungs', async () => {
		const { calls, options } = countingProvider();
		const { app } = appWith(rules, options);
		expect((await app.request('/api/bookmarks/b1')).status).toBe(401);
		expect(calls).toEqual([]);
	});

	it('is called once per request for a rule with keto rungs, however many', async () => {
		const { calls, options } = countingProvider();
		const { app } = appWith(rules, options);
		for (const id of ['b1', 'b2']) {
			expect(
				(
					await app.request(`/api/bookmarks/${id}`, {
						headers: bearer('alice'),
					})
				).status,
			).toBe(200);
		}
		// Two rungs, two requests: one call each — the answer is kept for the
		// request, never across requests.
		expect(calls).toEqual(['GET /api/bookmarks/b1', 'GET /api/bookmarks/b2']);
	});
});

describe('policyGuard — construction', () => {
	it('throws at construction on an invalid rules document, not per request', () => {
		expect(() => policyGuard({ rest: { '/x': { GTE: {} } } })).toThrow();
	});

	it('throws at construction on `public` with `keto`', () => {
		expect(() =>
			policyGuard({
				rest: {
					'/x/:id': {
						GET: {
							public: true,
							keto: [{ permissions: [[{ namespace: 'N', permit: 'view' }]] }],
						},
					},
				},
			}),
		).toThrow('`public` and `keto` are contradictory');
	});

	it('throws at construction on `[[]]`, which would admit everyone', () => {
		expect(() =>
			policyGuard({
				rest: { '/x/:id': { GET: { keto: [{ permissions: [[]] }] } } },
			}),
		).toThrow();
	});
});
