import { describe, expect, test } from 'bun:test';
import { createEdge, type EdgeConfig, type MirrorRecord } from './create-edge';
import {
	type Authenticator,
	AuthorityUnavailable,
	type EdgeDecision,
} from './types';

const ROUTES = {
	apps: [
		{ name: 'bookmarks', match: { prefix: '/api' }, upstream: 'http://b:3008' },
		{
			name: 'notes',
			match: { path: '/graphql' },
			upstream: 'http://n:5400',
		},
	],
};

const use = (permit = 'use') => ({
	keto: [
		{
			permissions: [[{ namespace: 'App', permit, id: 'param.app' }]],
			onDeny: 'FORBIDDEN',
		},
	],
});

const RULES = {
	global: { unmatched: 'deny' },
	rest: {
		'/health': { GET: { public: true } },
		'/api{/*rest}': {
			GET: use(),
			POST: use(),
			QUERY: use(),
		},
		'/graphql': { POST: use() },
	},
};

/** A caller the edge resolves, with a Keto answer we control. */
function caller(
	options: { sub?: string; allowed?: boolean } = {},
): Authenticator {
	return {
		name: 'stub',
		async resolve() {
			if (!options.sub) return null;
			return {
				claims: { sub: options.sub, kind: 'session' },
				assert: async () => `signed-for-${options.sub}`,
				permissions: {
					subject: options.sub,
					evaluatePermissions: async () => options.allowed ?? true,
				},
			};
		},
	};
}

/** An upstream that records what reached it and answers 200. */
function upstream(status = 200) {
	const seen: Request[] = [];
	const fetch = (async (input: Request) => {
		seen.push(input);
		return new Response(JSON.stringify({ ok: true }), {
			status,
			headers: { 'content-type': 'application/json' },
		});
	}) as unknown as typeof globalThis.fetch;
	return { seen, fetch };
}

function edge(overrides: Partial<EdgeConfig> = {}) {
	const records: (EdgeDecision | MirrorRecord)[] = [];
	const sink = upstream();
	const instance = createEdge({
		mode: 'enforce',
		routes: ROUTES,
		rules: RULES,
		authenticators: [caller({ sub: 'idn-7' })],
		fetch: sink.fetch,
		onDecision: (record) => records.push(record),
		...overrides,
	});
	return { edge: instance, records, sink };
}

const get = (path: string, headers: HeadersInit = {}) =>
	new Request(`https://edge.test${path}`, { headers });

describe('createEdge — enforce', () => {
	test('forwards an allowed caller, vouched for by a signed assertion', async () => {
		const { edge: e, sink, records } = edge();

		const response = await e.fetch(get('/api/bookmarks'));

		expect(response.status).toBe(200);
		expect(sink.seen).toHaveLength(1);
		expect(sink.seen[0]?.url).toBe('http://b:3008/api/bookmarks');
		expect(sink.seen[0]?.headers.get('authorization')).toBe(
			'Bearer signed-for-idn-7',
		);
		expect(records[0]).toMatchObject({
			app: 'bookmarks',
			subject: 'idn-7',
			decision: 'ALLOW',
			status: 0,
		});
	});

	test('refuses an anonymous caller with 401, and asks Keto nothing', async () => {
		let asked = 0;
		const anonymous: Authenticator = {
			name: 'stub',
			async resolve() {
				asked += 1;
				return null;
			},
		};
		const { edge: e, sink } = edge({ authenticators: [anonymous] });

		const response = await e.fetch(get('/api/bookmarks'));

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			status: 401,
			message: 'errors.unauthenticated',
		});
		// The authentication floor comes before the network: nothing reached
		// the upstream, and Keto was never a question.
		expect(sink.seen).toHaveLength(0);
		expect(asked).toBe(1);
	});

	test('refuses 403 when Keto says the caller may not reach the app', async () => {
		const {
			edge: e,
			sink,
			records,
		} = edge({
			authenticators: [caller({ sub: 'idn-7', allowed: false })],
		});

		const response = await e.fetch(get('/api/bookmarks'));

		expect(response.status).toBe(403);
		expect(sink.seen).toHaveLength(0);
		expect(records[0]).toMatchObject({ decision: 'DENY', status: 403 });
	});

	test('answers 503 when the authority could not be asked, never 403', async () => {
		const down: Authenticator = {
			name: 'stub',
			async resolve() {
				throw new AuthorityUnavailable('kratos');
			},
		};
		const { edge: e, sink, records } = edge({ authenticators: [down] });

		const response = await e.fetch(get('/api/bookmarks'));

		// The whole reason this exists. Oathkeeper answers 403 here, which a
		// caller cannot tell from a real refusal.
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			message: 'errors.service-unavailable',
		});
		expect(sink.seen).toHaveLength(0);
		expect(records[0]).toMatchObject({ status: 503, authenticator: 'kratos' });
	});

	test('a path no rule names is refused, not forwarded', async () => {
		const { edge: e, sink } = edge();

		const response = await e.fetch(get('/secret'));

		// 404, and deliberately indistinguishable from a path that is routed
		// but unnamed: the edge reveals nothing about which apps it fronts.
		expect(response.status).toBe(404);
		expect(sink.seen).toHaveLength(0);
	});

	test('a method the rules forgot is 404, like a path they never named', async () => {
		const { edge: e, sink } = edge();

		// `evaluateRest` indexes by method, so DELETE on a path whose rule
		// names only GET/POST/QUERY matches nothing — and `unmatched: deny`
		// turns that into a refusal instead of a pass.
		//
		// 404 rather than 403 because no rule matched at all: the edge is
		// saying there is nothing here, not that this caller may not have it.
		// Measured against Oathkeeper, which answers the same and is right to.
		const response = await e.fetch(
			new Request('https://edge.test/api/bookmarks/b1', { method: 'DELETE' }),
		);

		expect(response.status).toBe(404);
		expect(sink.seen).toHaveLength(0);
	});

	test('a refusal from a rule that DID match keeps 401 and 403', async () => {
		// The other half of the distinction: here the caller reached the app,
		// so they already know it is there and nothing is revealed by saying
		// whether they may have it.
		const { edge: anonymousEdge } = edge({
			authenticators: [
				{ name: 'stub', resolve: async () => null } satisfies Authenticator,
			],
		});
		expect((await anonymousEdge.fetch(get('/api/bookmarks'))).status).toBe(401);

		const { edge: refusedEdge } = edge({
			authenticators: [caller({ sub: 'idn-7', allowed: false })],
		});
		expect((await refusedEdge.fetch(get('/api/bookmarks'))).status).toBe(403);
	});

	test('QUERY travels verbatim — there is no method to pin', async () => {
		const { edge: e, sink } = edge();

		const response = await e.fetch(
			new Request('https://edge.test/api/bookmarks', { method: 'QUERY' }),
		);

		expect(response.status).toBe(200);
		expect(sink.seen[0]?.method).toBe('QUERY');
	});

	test('answers /health itself instead of leaving it a 404', async () => {
		const { edge: e, sink } = edge({ authenticators: [caller()] });

		const response = await e.fetch(get('/health'));

		// Oathkeeper has no rule for it by design, so `GET :4455/health` is a
		// 404 — and a host-agnostic rule for it would apply to every fronted
		// app at once.
		expect(response.status).toBe(200);
		expect(sink.seen).toHaveLength(0);
	});

	test('an identity header a caller sent does not survive the edge', async () => {
		const { edge: e, sink } = edge();

		await e.fetch(get('/api/bookmarks', { 'X-User-Id': 'someone-else' }));

		expect(sink.seen[0]?.headers.get('x-user-id')).toBeNull();
	});

	test('an unreachable upstream is 502 — an unreachable authority is 503', async () => {
		const refusing = (async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof globalThis.fetch;
		const { edge: e } = edge({ fetch: refusing });

		expect((await e.fetch(get('/api/bookmarks'))).status).toBe(502);
	});
});

describe('createEdge — mirror', () => {
	const mirror = (overrides: Partial<EdgeConfig> = {}) =>
		edge({
			mode: 'mirror',
			mirrorUpstream: 'http://oathkeeper:4455',
			...overrides,
		});

	test('sends every request to the mirrored edge, credential intact', async () => {
		const { edge: e, sink } = mirror();

		await e.fetch(get('/api/bookmarks', { authorization: 'Bearer theirs' }));

		expect(sink.seen[0]?.url).toBe('http://oathkeeper:4455/api/bookmarks');
		// Nothing minted: the edge being mirrored has to authenticate this
		// request itself, and it cannot do that with an assertion of ours.
		expect(sink.seen[0]?.headers.get('authorization')).toBe('Bearer theirs');
	});

	test('refuses nothing, and records what it would have refused', async () => {
		const {
			edge: e,
			sink,
			records,
		} = mirror({
			authenticators: [caller({ sub: 'idn-7', allowed: false })],
		});

		const response = await e.fetch(get('/api/bookmarks'));

		expect(response.status).toBe(200);
		expect(sink.seen).toHaveLength(1);
		expect(records[0]).toMatchObject({ status: 403, verdict: 'differ' });
	});

	test('its own failure is a log line and a passed-through request', async () => {
		const broken: Authenticator = {
			name: 'stub',
			async resolve() {
				throw new Error('a bug in the edge');
			},
		};
		const { edge: e, sink, records } = mirror({ authenticators: [broken] });

		const response = await e.fetch(get('/api/bookmarks'));

		// An edge under evaluation must not be able to break what works.
		expect(response.status).toBe(200);
		expect(sink.seen).toHaveLength(1);
		expect(records[0]).toMatchObject({ verdict: 'error' });
	});

	test('forwards a request no app matches — the mirrored edge decides', async () => {
		const { edge: e, sink } = mirror();

		const response = await e.fetch(get('/nowhere'));

		expect(response.status).toBe(200);
		expect(sink.seen[0]?.url).toBe('http://oathkeeper:4455/nowhere');
	});

	test('records agreement when both would let it through', async () => {
		const { edge: e, records } = mirror();

		await e.fetch(get('/api/bookmarks'));

		expect(records[0]).toMatchObject({ status: 0, verdict: 'agree' });
	});
});

describe('createEdge — configuration', () => {
	test('mirror mode without a mirrored edge is refused at construction', () => {
		expect(() =>
			createEdge({
				mode: 'mirror',
				routes: ROUTES,
				rules: RULES,
				authenticators: [],
			}),
		).toThrow(/needs a `mirrorUpstream`/);
	});

	test('enforce mode with one left set is refused too', () => {
		expect(() =>
			createEdge({
				mode: 'enforce',
				routes: ROUTES,
				rules: RULES,
				authenticators: [],
				mirrorUpstream: 'http://oathkeeper:4455',
			}),
		).toThrow(/must not have a `mirrorUpstream`/);
	});

	// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax under test
	test('expands `${VAR}` in an upstream, and refuses an unset one', () => {
		const built = createEdge({
			mode: 'enforce',
			routes: {
				apps: [
					{
						name: 'bookmarks',
						match: { prefix: '/api' },
						// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax under test
						upstream: '${BOOKMARKS_API_URL}',
					},
				],
			},
			rules: RULES,
			authenticators: [],
			env: { BOOKMARKS_API_URL: 'http://host.docker.internal:3008' },
		});
		expect(built.routes.apps[0]?.upstream).toBe(
			'http://host.docker.internal:3008',
		);

		expect(() =>
			createEdge({
				mode: 'enforce',
				routes: {
					apps: [
						{
							name: 'bookmarks',
							match: { prefix: '/api' },
							// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax under test
							upstream: '${MISSING}',
						},
					],
				},
				rules: RULES,
				authenticators: [],
				env: {},
			}),
		).toThrow(/\$\{MISSING\}, which is unset/);
	});
});
