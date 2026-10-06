import { describe, expect, it } from 'bun:test';
import type { Permission, Subject } from '@nxgt/ory-sdk';
import { USER_HEADERS } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ketoPermissions } from './keto';
import { policyGuard } from './policy-guard';

/**
 * A stub of the per-request `ketoChecks` loader `oryChecks(ory)` publishes:
 * it records every question in Keto's own `Namespace:object#relation@subject`
 * notation and answers from `grants`.
 */
function recordingCheck(grants: string[]) {
	const asked: string[] = [];
	const check = async (permission: Permission, subject: Subject) => {
		const who =
			typeof subject === 'string'
				? subject
				: `${subject.subjectSet.namespace}:${subject.subjectSet.object}#${subject.subjectSet.relation}`;
		const tuple = `${permission.namespace}:${permission.object}#${permission.relation}@${who}`;
		asked.push(tuple);
		return grants.includes(tuple);
	};
	return { asked, check };
}

interface Wiring {
	/** What `oryAuth()` would put on `ory.subject`; omit for none. */
	subject?: Subject;
	/** What `oryChecks(ory)` would publish as `ketoChecks`; omit for none. */
	check?: (permission: Permission, subject: Subject) => Promise<boolean>;
}

/**
 * A real Hono app wired the way the README says: the Ory middlewares first
 * (stood in for by one that sets the same two context variables, and the
 * claims a resolved caller would carry), then the guard with
 * `ketoPermissions()`.
 */
function appWith(rules: unknown, wiring: Wiring) {
	const app = new Hono();
	app.onError((err, c) =>
		err instanceof CustomException
			? c.json(
					{ message: err.message, debugMessage: err.debugMessage },
					err.code as ContentfulStatusCode,
				)
			: c.json({ error: err.message }, 500),
	);
	app.use('*', async (c, next) => {
		if (wiring.subject !== undefined) {
			c.set('ory' as never, { subject: wiring.subject } as never);
			c.set(USER_HEADERS.CLAIMS as never, { sub: 'idn-7' } as never);
		}
		if (wiring.check) c.set('ketoChecks' as never, wiring.check as never);
		await next();
	});
	app.use('/api/*', policyGuard(rules, { permissions: ketoPermissions() }));
	app.all('/api/*', (c) => c.json({ ok: true }));
	return app;
}

const term = (permit: string, id = 'param.id', namespace = 'Bookmark') => ({
	namespace,
	permit,
	id,
});

const one = (...terms: ReturnType<typeof term>[]) => ({
	rest: {
		'/api/bookmarks/:id': { PATCH: { keto: [{ permissions: [terms] }] } },
	},
});

const patch = (app: Hono, path = '/api/bookmarks/b1', init: RequestInit = {}) =>
	app.request(path, { method: 'PATCH', ...init });

describe('ketoPermissions (Hono) — every term of the grammar', () => {
	it('asks the loader with namespace, object from param.<name>, permit as relation, and ory.subject', async () => {
		const { asked, check } = recordingCheck(['Bookmark:b1#view@idn-7']);
		const app = appWith(one(term('view')), { subject: 'idn-7', check });
		expect((await patch(app)).status).toBe(200);
		expect(asked).toEqual(['Bookmark:b1#view@idn-7']);
	});

	it('a refused term is a 404 by default (onDeny NOT_FOUND, errors.not-found)', async () => {
		const { asked, check } = recordingCheck([]);
		const app = appWith(one(term('view')), { subject: 'idn-7', check });
		const res = await patch(app);
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ message: 'errors.not-found' });
		expect(asked).toEqual(['Bookmark:b1#view@idn-7']);
	});

	it('reads the object from query.<name>', async () => {
		const { asked, check } = recordingCheck(['Project:p9#view@idn-7']);
		const app = appWith(one(term('view', 'query.projectId', 'Project')), {
			subject: 'idn-7',
			check,
		});
		expect((await patch(app, '/api/bookmarks/b1?projectId=p9')).status).toBe(
			200,
		);
		expect(asked).toEqual(['Project:p9#view@idn-7']);
	});

	it('reads the object from json.<path>, nested', async () => {
		const { asked, check } = recordingCheck(['Folder:f1#edit@idn-7']);
		const app = appWith(one(term('edit', 'json.target.folderId', 'Folder')), {
			subject: 'idn-7',
			check,
		});
		const res = await patch(app, '/api/bookmarks/b1', {
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ target: { folderId: 'f1' } }),
		});
		expect(res.status).toBe(200);
		expect(asked).toEqual(['Folder:f1#edit@idn-7']);
	});

	it('a json path naming a LIST requires the permit on every element', async () => {
		const { asked, check } = recordingCheck([
			'Bookmark:a#edit@idn-7',
			'Bookmark:b#edit@idn-7',
		]);
		const app = appWith(one(term('edit', 'json.ids')), {
			subject: 'idn-7',
			check,
		});
		const body = (ids: string[]) => ({
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ids }),
		});
		expect(
			(await patch(app, '/api/bookmarks/x', body(['a', 'b']))).status,
		).toBe(200);
		expect(asked).toEqual(['Bookmark:a#edit@idn-7', 'Bookmark:b#edit@idn-7']);

		asked.length = 0;
		expect(
			(await patch(app, '/api/bookmarks/x', body(['a', 'c', 'b']))).status,
		).toBe(404);
		// Short-circuits at the first refused element.
		expect(asked).toEqual(['Bookmark:a#edit@idn-7', 'Bookmark:c#edit@idn-7']);
	});

	it('an inner list is AND: every term must hold, stopping at the first false', async () => {
		const { asked, check } = recordingCheck(['Bookmark:b1#view@idn-7']);
		const app = appWith(one(term('view'), term('edit'), term('share')), {
			subject: 'idn-7',
			check,
		});
		expect((await patch(app)).status).toBe(404);
		expect(asked).toEqual(['Bookmark:b1#view@idn-7', 'Bookmark:b1#edit@idn-7']);
	});

	it('the outer list is OR: the first group that holds wins and the rest are not asked', async () => {
		const { asked, check } = recordingCheck(['Bookmark:b1#owner@idn-7']);
		const app = appWith(
			{
				rest: {
					'/api/bookmarks/:id': {
						PATCH: {
							keto: [
								{
									permissions: [
										[term('edit')],
										[term('owner')],
										[term('admin')],
									],
								},
							],
						},
					},
				},
			},
			{ subject: 'idn-7', check },
		);
		expect((await patch(app)).status).toBe(200);
		expect(asked).toEqual([
			'Bookmark:b1#edit@idn-7',
			'Bookmark:b1#owner@idn-7',
		]);
	});

	it('rungs run in order, each with its own denial and message: the 404-then-403 ladder', async () => {
		const rules = {
			rest: {
				'/api/bookmarks/:id': {
					PATCH: {
						keto: [
							{
								permissions: [[term('view')]],
								message: 'bookmarks.errors.not-found',
							},
							{ permissions: [[term('edit')]], onDeny: 'FORBIDDEN' },
						],
					},
				},
			},
		};

		const stranger = recordingCheck([]);
		const res1 = await patch(
			appWith(rules, { subject: 'idn-7', check: stranger.check }),
		);
		expect(res1.status).toBe(404);
		expect(await res1.json()).toMatchObject({
			message: 'bookmarks.errors.not-found',
		});
		expect(stranger.asked).toEqual(['Bookmark:b1#view@idn-7']);

		const viewer = recordingCheck(['Bookmark:b1#view@idn-7']);
		const res2 = await patch(
			appWith(rules, { subject: 'idn-7', check: viewer.check }),
		);
		expect(res2.status).toBe(403);
		expect(await res2.json()).toMatchObject({
			message: 'errors.insufficient-permissions',
		});
		expect(viewer.asked).toEqual([
			'Bookmark:b1#view@idn-7',
			'Bookmark:b1#edit@idn-7',
		]);
	});

	it('passes a subject set through unchanged', async () => {
		const { asked, check } = recordingCheck([
			'Bookmark:b1#view@Group:eng#members',
		]);
		const app = appWith(one(term('view')), {
			subject: {
				subjectSet: { namespace: 'Group', object: 'eng', relation: 'members' },
			},
			check,
		});
		expect((await patch(app)).status).toBe(200);
		expect(asked).toEqual(['Bookmark:b1#view@Group:eng#members']);
	});
});

describe('ketoPermissions (Hono) — error paths', () => {
	it('a term whose id resolves nothing throws — a wiring mistake, never an allow', async () => {
		const { asked, check } = recordingCheck([]);
		const app = appWith(one(term('view', 'query.missing')), {
			subject: 'idn-7',
			check,
		});
		const res = await patch(app);
		expect(res.status).toBe(500);
		expect((await res.json()).error).toContain(
			'read "query.missing", which resolved no object id',
		);
		expect(asked).toEqual([]);
	});

	it('a loader that rejects fails the request, never allows it', async () => {
		const app = appWith(one(term('view')), {
			subject: 'idn-7',
			check: async () => {
				throw new Error('keto unreachable');
			},
		});
		const res = await patch(app);
		expect(res.status).toBe(500);
		expect((await res.json()).error).toBe('keto unreachable');
	});

	it('no ory.subject on an authenticated caller answers 401 and asks nothing', async () => {
		// Reached whenever the claims name a caller and `ory.subject` does not
		// — e.g. claims from another token resolver than `oryAuth()`. There is
		// nobody to ask Keto about, so it fails closed.
		const { asked, check } = recordingCheck([]);
		const app = new Hono();
		app.onError((err, c) =>
			c.json({}, (err as CustomException).code as ContentfulStatusCode),
		);
		app.use('*', async (c, next) => {
			c.set(USER_HEADERS.CLAIMS as never, { sub: 'idn-7' } as never);
			c.set('ketoChecks' as never, check as never);
			await next();
		});
		app.use(
			'/api/*',
			policyGuard(one(term('view')), { permissions: ketoPermissions() }),
		);
		app.all('/api/*', (c) => c.text('ok'));
		expect((await patch(app)).status).toBe(401);
		expect(asked).toEqual([]);
	});

	it('without oryChecks mounted, a rule carrying keto throws the wiring error', async () => {
		const app = appWith(one(term('view')), { subject: 'idn-7' });
		const res = await patch(app);
		expect(res.status).toBe(500);
		expect((await res.json()).error).toContain(
			'oryChecks(ory) is not mounted on this app',
		);
	});

	it('without oryChecks mounted, a rule with no keto term and a path no rule names still pass', async () => {
		// The provider is called only once the matched rule carries a `keto`
		// term, so `oryChecks` can be mounted on a narrower prefix than the
		// guard without breaking the routes that never ask Keto anything.
		const app = appWith(
			{
				rest: {
					'/api/plain': { GET: { authenticated: true } },
					'/api/bookmarks/:id': {
						PATCH: { keto: [{ permissions: [[term('view')]] }] },
					},
				},
			},
			{ subject: 'idn-7' },
		);
		for (const path of ['/api/plain', '/api/unnamed']) {
			expect((await app.request(path)).status).toBe(200);
		}
		// …while the keto rule on the same app still fails with the wiring error.
		const res = await patch(app);
		expect(res.status).toBe(500);
		expect((await res.json()).error).toContain(
			'a rule carries a `keto` check, but oryChecks(ory) is not mounted',
		);
	});

	it('with oryChecks mounted, a rule with no keto term never touches the loader', async () => {
		const { asked, check } = recordingCheck([]);
		const app = appWith(
			{ rest: { '/api/plain': { GET: { authenticated: true } } } },
			{ subject: 'idn-7', check },
		);
		expect((await app.request('/api/plain')).status).toBe(200);
		expect(asked).toEqual([]);
	});
});
