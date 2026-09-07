import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createOry, type OryPrincipal } from 'stx-sdk/ory';
import { createErrorHandler } from './error-handler';
import { ketoCheck, requireAuthenticated, useOry } from './keto-check';
import { withOryUnavailable } from './ory-auth';

/**
 * Against a stubbed Keto: what the batch endpoint answers, and what a route
 * therefore returns. `stx-sdk/ory` owns the wire format; this owns the mapping
 * from a denial to a status code, which is the part a route spec depends on.
 */
function stack(held: string[], status = 200) {
	const batches: unknown[][] = [];

	const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		const { tuples } = (await request.json()) as {
			tuples: Record<string, string>[];
		};
		batches.push(tuples);
		return new Response(
			JSON.stringify({
				results: tuples.map((t) => ({
					allowed: held.includes(
						`${t.namespace}:${t.object}#${t.relation}@${t.subject_id}`,
					),
				})),
			}),
			{ status, headers: { 'content-type': 'application/json' } },
		);
	};

	const ory = createOry({
		kratosPublicUrl: 'http://kratos.test:4433',
		ketoReadUrl: 'http://keto.test:4466',
		fetch: fetch as typeof globalThis.fetch,
	});

	return { ory, batches };
}

/** A signed-in caller, without going through `oryAuth()`. */
const principal = (subject: string | null) =>
	subject === null
		? null
		: ({ subject, kind: 'session', scopes: [] } as unknown as OryPrincipal);

function app(
	held: string[],
	subject: string | null,
	mount: (app: Hono) => void,
	status = 200,
) {
	const { ory, batches } = stack(held, status);
	const hono = new Hono();

	hono.onError(
		withOryUnavailable(
			createErrorHandler((key) => key, { logToConsole: false }),
		),
	);
	hono.use('*', async (ctx, next) => {
		ctx.set('ory', principal(subject));
		return next();
	});
	hono.use('*', useOry(ory));
	mount(hono);

	return { hono, batches };
}

describe('requireAuthenticated', () => {
	test('401 for a caller oryAuth could not resolve', async () => {
		const { hono } = app([], null, (a) =>
			a.get('/x', requireAuthenticated(), (ctx) => ctx.text('ok')),
		);
		expect((await hono.request('/x')).status).toBe(401);
	});

	test('through for a resolved one', async () => {
		const { hono } = app([], 'idn-7', (a) =>
			a.get('/x', requireAuthenticated(), (ctx) => ctx.text('ok')),
		);
		expect((await hono.request('/x')).status).toBe(200);
	});
});

describe('ketoCheck', () => {
	const view = (id = 'param.id') => [
		[{ namespace: 'Bookmark', permit: 'view', id }],
	];
	const edit = (id = 'param.id') => [
		[{ namespace: 'Bookmark', permit: 'edit', id }],
	];

	test('runs the handler when the permission holds', async () => {
		const { hono } = app(['Bookmark:b1#view@idn-7'], 'idn-7', (a) =>
			a.get('/:id', ketoCheck(view()), (ctx) => ctx.text('ok')),
		);
		const response = await hono.request('/b1');

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});

	test('404 by default, so an id cannot be probed', async () => {
		const { hono } = app([], 'idn-7', (a) =>
			a.get('/:id', ketoCheck(view()), (ctx) => ctx.text('ok')),
		);
		expect((await hono.request('/b1')).status).toBe(404);
	});

	test('two of them are the ladder: 404 for a stranger, 403 for a viewer', async () => {
		const mount = (a: Hono) =>
			a.patch(
				'/:id',
				ketoCheck(view()),
				ketoCheck(edit(), { onDeny: 'FORBIDDEN' }),
				(ctx) => ctx.text('ok'),
			);

		const stranger = app([], 'idn-7', mount);
		expect(
			(await stranger.hono.request('/b1', { method: 'PATCH' })).status,
		).toBe(404);

		const viewer = app(['Bookmark:b1#view@idn-7'], 'idn-7', mount);
		expect((await viewer.hono.request('/b1', { method: 'PATCH' })).status).toBe(
			403,
		);

		const owner = app(
			['Bookmark:b1#view@idn-7', 'Bookmark:b1#edit@idn-7'],
			'idn-7',
			mount,
		);
		expect((await owner.hono.request('/b1', { method: 'PATCH' })).status).toBe(
			200,
		);
	});

	/**
	 * The route guard and the module's `<m>.access.ts` guard the same object.
	 * If they word one 404 differently, the wording tells the caller which one
	 * spoke — the difference NOT_FOUND is there to hide. `createErrorHandler`
	 * is given an identity translator here, so the body carries the raw key.
	 */
	test('carries the message the route names, on both rungs', async () => {
		const mount = (a: Hono) =>
			a.patch(
				'/:id',
				ketoCheck(view(), { message: 'bookmarks.errors.not-found' }),
				ketoCheck(edit(), {
					onDeny: 'FORBIDDEN',
					message: 'bookmarks.errors.read-only',
				}),
				(ctx) => ctx.text('ok'),
			);

		const stranger = app([], 'idn-7', mount);
		const hidden = await stranger.hono.request('/b1', { method: 'PATCH' });
		expect(hidden.status).toBe(404);
		expect((await hidden.json()).message).toBe('bookmarks.errors.not-found');

		const viewer = app(['Bookmark:b1#view@idn-7'], 'idn-7', mount);
		const refused = await viewer.hono.request('/b1', { method: 'PATCH' });
		expect(refused.status).toBe(403);
		expect((await refused.json()).message).toBe('bookmarks.errors.read-only');
	});

	test('falls back to the shared errors.* keys when the route says nothing', async () => {
		const { hono } = app([], 'idn-7', (a) =>
			a.get('/:id', ketoCheck(view()), (ctx) => ctx.text('ok')),
		);
		const response = await hono.request('/b1');
		expect((await response.json()).message).toBe('errors.not-found');
	});

	test('401 before asking Keto anything', async () => {
		const { hono, batches } = app(['Bookmark:b1#view@idn-7'], null, (a) =>
			a.get('/:id', ketoCheck(view()), (ctx) => ctx.text('ok')),
		);

		expect((await hono.request('/b1')).status).toBe(401);
		expect(batches).toHaveLength(0);
	});

	test('reads an id out of the body', async () => {
		const { hono } = app(['Bookmark:b9#edit@idn-7'], 'idn-7', (a) =>
			a.post('/share', ketoCheck(edit('json.bookmarkId')), (ctx) =>
				ctx.text('ok'),
			),
		);

		const response = await hono.request('/share', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ bookmarkId: 'b9' }),
		});
		expect(response.status).toBe(200);
	});

	test('asks the same question once across two middlewares', async () => {
		const { hono, batches } = app(['Bookmark:b1#view@idn-7'], 'idn-7', (a) =>
			a.get('/:id', ketoCheck(view()), ketoCheck(view()), (ctx) =>
				ctx.text('ok'),
			),
		);

		expect((await hono.request('/b1')).status).toBe(200);
		expect(batches).toHaveLength(1);
	});

	test('a Keto outage is a 503, never a denial', async () => {
		const { hono } = app(
			[],
			'idn-7',
			(a) => a.get('/:id', ketoCheck(view()), (ctx) => ctx.text('ok')),
			503,
		);
		expect((await hono.request('/b1')).status).toBe(503);
	});

	test('refuses a path naming no known root, when the route is declared', () => {
		expect(() =>
			ketoCheck([[{ namespace: 'B', permit: 'view', id: 'args.id' }]]),
		).toThrow(/must be "param\.<name>"/);
	});

	test('refuses an empty group, which would admit everyone', () => {
		expect(() => ketoCheck([[]])).toThrow(/admits EVERYONE/);
	});
});
