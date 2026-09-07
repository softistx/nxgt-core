import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../compile';
import { evaluateGraphql } from '../graphql/evaluator';
import type { PermissionEvaluator } from '../permissions.types';
import type { Rules } from '../rules.schema';
import { evaluateRest } from './evaluator';

describe('evaluateRest — $domain authority templating', () => {
	it("does not leak one request's domain substitution into the next", async () => {
		// Single shared, precompiled policy, exactly as a service loads it once
		// at startup via `compilePolicy(RulesSchema.parse(...))` and reuses for
		// every request.
		const rules: Rules = {
			rest: {
				'/orgs/:domain/widgets': {
					GET: {
						authorities: [['SCOPE_oauth:$domain']],
					},
				},
			},
		};
		const policy = compilePolicy(rules);

		const claimsForAcme = { sub: 'user-1', authorities: ['SCOPE_oauth:acme'] };
		const claimsForOther = {
			sub: 'user-2',
			authorities: ['SCOPE_oauth:other'],
		};

		const first = await evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/acme/widgets',
			claims: claimsForAcme,
		});
		expect(first.decision).toBe('ALLOW');

		// A second request for a DIFFERENT domain, with claims that only satisfy
		// that second domain, must be evaluated independently — the first
		// request must not have permanently baked "acme" into the shared rule.
		const second = await evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/other/widgets',
			claims: claimsForOther,
		});
		expect(second.decision).toBe('ALLOW');

		// And a request for "other" with claims that only satisfy "acme" must
		// still be denied — proving the substitution is truly per-request.
		const thirdDeniedForWrongDomain = await evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/other/widgets',
			claims: claimsForAcme,
		});
		expect(thirdDeniedForWrongDomain.decision).toBe('DENY');
	});
});

describe('evaluateRest — authentication floor', () => {
	const policy = compilePolicy({
		rest: {
			'/reports': {
				// The shape that used to read as "authenticated caller is
				// sufficient" while actually admitting everyone.
				GET: { authorities: [] },
				POST: { authorities: [['reports:create']] },
			},
			'/profile': {
				GET: { authenticated: true },
			},
			'/shares/:token': {
				GET: { public: true },
			},
			'/legacy': {
				GET: { expression: { value: 'true', message: 'open' } },
			},
		},
	} as Rules);

	const anonymous = {} as any;
	const user = { sub: 'user-1', authorities: [] };

	const get = (path: string, claims: any, method = 'GET') =>
		evaluateRest(policy, { type: 'rest', method, path, claims });

	it('refuses an anonymous caller on a matched rule that asks for nothing', async () => {
		// The whole point: an empty authority list is not a licence to skip
		// authentication, which is how `checkAuthorities` alone read it.
		expect((await get('/reports', anonymous)).decision).toBe('UNAUTHENTICATED');
		expect((await get('/profile', anonymous)).decision).toBe('UNAUTHENTICATED');
		expect((await get('/legacy', anonymous)).decision).toBe('UNAUTHENTICATED');
	});

	it('separates "not signed in" from "not allowed"', async () => {
		// Same route, same missing authority — but the answers must differ, or
		// a UI cannot tell an expired session from a forbidden one.
		expect((await get('/reports', anonymous, 'POST')).decision).toBe(
			'UNAUTHENTICATED',
		);
		expect((await get('/reports', user, 'POST')).decision).toBe('DENY');
	});

	it('lets a signed-in caller through a rule with no authority requirement', async () => {
		expect((await get('/reports', user)).decision).toBe('ALLOW');
		expect((await get('/profile', user)).decision).toBe('ALLOW');
	});

	it('treats a confidential client as authenticated', async () => {
		// client_credentials tokens name no user, only a client.
		expect((await get('/profile', { clientId: 'svc-1' } as any)).decision).toBe(
			'ALLOW',
		);
	});

	it('lets anonymous callers reach a rule marked public', async () => {
		// Share links carry their own credential; the service checks the
		// token, password and expiry itself.
		expect((await get('/shares/abc', anonymous)).decision).toBe('ALLOW');
	});

	it('leaves unmatched paths open, as before', async () => {
		expect((await get('/unknown', anonymous)).decision).toBe('NOT_APPLICABLE');
	});
});

describe('compilePolicy — contradictory rule', () => {
	it('refuses a rule that is both authenticated and public', async () => {
		expect(() =>
			compilePolicy({
				rest: { '/x': { GET: { authenticated: true, public: true } } },
			} as Rules),
		).toThrow(/contradictory/);
	});
});

describe('evaluateGraphql — authentication floor', () => {
	it('applies the same floor and the same opt-out as REST', async () => {
		const policy = compilePolicy({
			graphql: {
				Query: {
					me: { authenticated: true },
					publicFeed: { public: true },
				},
			},
		} as Rules);

		const run = (field: string, claims: any) =>
			evaluateGraphql(policy, {
				type: 'graphql',
				operationType: 'Query',
				field,
				claims,
			} as any);

		expect((await run('me', {})).decision).toBe('UNAUTHENTICATED');
		expect((await run('me', { sub: 'user-1' })).decision).toBe('ALLOW');
		expect((await run('publicFeed', {})).decision).toBe('ALLOW');
	});
});

// ---------------------------------------------------------------------------
// Keto terms
// ---------------------------------------------------------------------------

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

const LADDER: Rules = {
	rest: {
		'/bookmarks/:id': {
			GET: {
				keto: [
					{
						permissions: [
							[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
						],
						onDeny: 'NOT_FOUND',
						message: 'bookmarks.errors.not-found',
					},
				],
			},
			PATCH: {
				keto: [
					{
						permissions: [
							[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
						],
						onDeny: 'NOT_FOUND',
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

describe('evaluateRest — the 404-then-403 ladder', () => {
	const policy = compilePolicy(LADDER);
	const caller = { sub: 'idn-7' };

	const patch = (granted: string[]) => {
		const keto = fakeKeto(granted);
		return {
			keto,
			result: evaluateRest(
				policy,
				{
					type: 'rest',
					method: 'PATCH',
					path: '/bookmarks/b1',
					claims: caller,
				},
				{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
			),
		};
	};

	it('tells a stranger the bookmark is not there', async () => {
		const { result } = patch([]);
		expect(await result).toMatchObject({
			decision: 'DENY',
			denial: 'NOT_FOUND',
			message: 'bookmarks.errors.not-found',
		});
	});

	it('tells a viewer who tries to write that they may not', async () => {
		const { result } = patch(['Bookmark:b1#view@idn-7']);
		expect(await result).toMatchObject({
			decision: 'DENY',
			denial: 'FORBIDDEN',
			// No `message` on that rung, so the shared key `ketoCheck()` uses.
			message: 'errors.insufficient-permissions',
		});
	});

	it('lets an editor through', async () => {
		const { result } = patch([
			'Bookmark:b1#view@idn-7',
			'Bookmark:b1#edit@idn-7',
		]);
		expect((await result).decision).toBe('ALLOW');
	});

	it('stops at the first rung that refuses, and does not ask the second', async () => {
		const { keto, result } = patch([]);
		await result;
		expect(keto.asked).toEqual(['Bookmark:b1#view@idn-7']);
	});
});

describe('evaluateRest — what a Keto term costs, and when', () => {
	it('refuses an anonymous caller before spending a round trip', async () => {
		const keto = fakeKeto([]);
		const result = await evaluateRest(
			compilePolicy(LADDER),
			{ type: 'rest', method: 'GET', path: '/bookmarks/b1', claims: {} as any },
			{ evaluatePermissions: keto.evaluatePermissions, subject: null },
		);

		expect(result.decision).toBe('UNAUTHENTICATED');
		expect(keto.asked).toHaveLength(0);
	});

	it('checks authorities before spending a round trip', async () => {
		const keto = fakeKeto([]);
		const policy = compilePolicy({
			rest: {
				'/bookmarks/:id': {
					GET: {
						authorities: [['ADMIN']],
						keto: [
							{
								permissions: [
									[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
								],
								onDeny: 'NOT_FOUND',
							},
						],
					},
				},
			},
		} as Rules);

		const result = await evaluateRest(
			policy,
			{
				type: 'rest',
				method: 'GET',
				path: '/bookmarks/b1',
				claims: { sub: 'idn-7', authorities: [] },
			},
			{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
		);

		// An authority refusal, so no `denial` — the guard still answers 403,
		// exactly as it did before Keto terms existed.
		expect(result.decision).toBe('DENY');
		expect(result.denial).toBeUndefined();
		expect(keto.asked).toHaveLength(0);
	});

	it('throws, rather than allowing, when no permission evaluator was supplied', async () => {
		expect(
			evaluateRest(compilePolicy(LADDER), {
				type: 'rest',
				method: 'GET',
				path: '/bookmarks/b1',
				claims: { sub: 'idn-7' },
			}),
		).rejects.toThrow(/no permission evaluator was supplied/);
	});
});

describe('evaluateRest — reading [[A, B], [C]] as "(A and B) or C"', () => {
	const policy = compilePolicy({
		rest: {
			'/projects/:projectId/files/:id': {
				DELETE: {
					keto: [
						{
							permissions: [
								[
									{
										namespace: 'Project',
										permit: 'edit',
										id: 'param.projectId',
									},
									{ namespace: 'File', permit: 'edit', id: 'param.id' },
								],
								[{ namespace: 'File', permit: 'own', id: 'param.id' }],
							],
							onDeny: 'FORBIDDEN',
						},
					],
				},
			},
		},
	} as Rules);

	const del = (granted: string[]) =>
		evaluateRest(
			policy,
			{
				type: 'rest',
				method: 'DELETE',
				path: '/projects/p1/files/f1',
				claims: { sub: 'idn-7' },
			},
			{
				evaluatePermissions: fakeKeto(granted).evaluatePermissions,
				subject: 'idn-7',
			},
		);

	const P = 'Project:p1#edit@idn-7';
	const F = 'File:f1#edit@idn-7';
	const O = 'File:f1#own@idn-7';

	it.each([
		[[], 'DENY'],
		[[P], 'DENY'],
		[[F], 'DENY'],
		[[P, F], 'ALLOW'],
		[[O], 'ALLOW'],
	] as const)('granted %p → %s', async (granted, decision) => {
		expect((await del([...granted])).decision).toBe(decision);
	});
});

describe('evaluateRest — where an object id comes from', () => {
	const run = async (
		id: string,
		req: Record<string, unknown>,
		granted: string[] = [],
	) => {
		const keto = fakeKeto(granted);
		const policy = compilePolicy({
			rest: {
				'/things/:id': {
					POST: {
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
		const result = await evaluateRest(
			policy,
			{
				type: 'rest',
				method: 'POST',
				path: '/things/t1',
				claims: { sub: 'idn-7' },
				req,
			},
			{ evaluatePermissions: keto.evaluatePermissions, subject: 'idn-7' },
		);
		return { asked: keto.asked, result };
	};

	it('reads `param.` from the pattern written in the rules file', async () => {
		// Not from the app's own route: the capture comes from `/things/:id`
		// here, so a rules file spelling the parameter differently is how the
		// two rails drift apart.
		const { asked } = await run('param.id', {});
		expect(asked).toEqual(['Thing:t1#view@idn-7']);
	});

	it('reads `query.`', async () => {
		const { asked } = await run('query.thingId', { query: { thingId: 't9' } });
		expect(asked).toEqual(['Thing:t9#view@idn-7']);
	});

	it('reads a dotted `json.` path out of the body', async () => {
		const { asked } = await run('json.thing.id', {
			body: { thing: { id: 't42' } },
		});
		expect(asked).toEqual(['Thing:t42#view@idn-7']);
	});

	it('requires the permit on every id when the path resolves a list', async () => {
		const { asked, result } = await run(
			'json.ids',
			{ body: { ids: ['a', 'b'] } },
			['Thing:a#view@idn-7'],
		);
		expect(asked).toEqual(['Thing:a#view@idn-7', 'Thing:b#view@idn-7']);
		expect(result.decision).toBe('DENY');
	});

	it('throws rather than denying when the path resolves no id', async () => {
		// A term naming no object is a wiring mistake. Answering `false` would
		// dress it up as a policy decision.
		expect(run('query.missing', { query: {} })).rejects.toThrow(
			/resolved no object id/,
		);
	});
});

describe('evaluateRest — `global.unmatched`', () => {
	const named: Rules['rest'] = {
		'/things/:id': { GET: { authenticated: true } },
	};

	const ask = (
		unmatched: 'allow' | 'deny' | undefined,
		path: string,
		claims: Record<string, unknown> = { sub: 'idn-7' },
	) =>
		evaluateRest(
			compilePolicy({
				global: unmatched ? { unmatched } : undefined,
				rest: named,
			} as Rules),
			{
				type: 'rest',
				method: 'GET',
				path,
				claims: claims as never,
			},
		);

	it('is open by default, which is what every document written so far means', async () => {
		const result = await ask(undefined, '/things/t1/share');
		expect(result.decision).toBe('NOT_APPLICABLE');
	});

	it('is still open when the document says so out loud', async () => {
		const result = await ask('allow', '/things/t1/share');
		expect(result.decision).toBe('NOT_APPLICABLE');
	});

	it('refuses an unnamed path when the document says deny', async () => {
		const result = await ask('deny', '/things/t1/share');
		expect(result.decision).toBe('DENY');
		// The reason names the path AND the reason it was refused, because a
		// 403 on a route nobody thought was guarded is otherwise a long
		// afternoon.
		expect(result.reason).toContain('GET /things/t1/share');
		expect(result.reason).toContain('`global.unmatched` is deny');
	});

	it('answers an anonymous caller 401, not 403', async () => {
		// The same split a matched rule makes: the UIs re-authenticate on 401
		// and show a refusal on 403. An unnamed path must not tell a signed-out
		// caller they lack a permission.
		const result = await ask('deny', '/things/t1/share', {});
		expect(result.decision).toBe('UNAUTHENTICATED');
	});

	it('changes nothing for a path the document does name', async () => {
		const result = await ask('deny', '/things/t1');
		expect(result.decision).toBe('ALLOW');
	});

	it('still refuses an unnamed METHOD on a named path', async () => {
		// The trap this is really for: `/things/:id` is in the file, `DELETE`
		// is not, and routes are partitioned by method.
		const result = await evaluateRest(
			compilePolicy({ global: { unmatched: 'deny' }, rest: named } as Rules),
			{
				type: 'rest',
				method: 'DELETE',
				path: '/things/t1',
				claims: { sub: 'idn-7' } as never,
			},
		);
		expect(result.decision).toBe('DENY');
	});

	it('refuses to compile beside a `graphql:` block, rather than doing nothing there', async () => {
		// `applyGraphqlPolicy` never wraps a field no rule names, so no default
		// could reach it. Accepting the flag would say "closed" and mean
		// "open on half the document".
		expect(() =>
			compilePolicy({
				global: { unmatched: 'deny' },
				rest: named,
				graphql: { Query: { thing: { authenticated: true } } },
			} as Rules),
		).toThrow(/REST-only/);
	});
});
