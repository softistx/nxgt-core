import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../compile';
import { evaluateGraphql } from '../graphql/evaluator';
import type { Rules } from '../rules.schema';
import { evaluateRest } from './evaluator';

describe('evaluateRest — $domain authority templating', () => {
	it("does not leak one request's domain substitution into the next", () => {
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

		const first = evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/acme/widgets',
			claims: claimsForAcme,
		});
		expect(first.decision).toBe('ALLOW');

		// A second request for a DIFFERENT domain, with claims that only satisfy
		// that second domain, must be evaluated independently — the first
		// request must not have permanently baked "acme" into the shared rule.
		const second = evaluateRest(policy, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/other/widgets',
			claims: claimsForOther,
		});
		expect(second.decision).toBe('ALLOW');

		// And a request for "other" with claims that only satisfy "acme" must
		// still be denied — proving the substitution is truly per-request.
		const thirdDeniedForWrongDomain = evaluateRest(policy, {
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

	it('refuses an anonymous caller on a matched rule that asks for nothing', () => {
		// The whole point: an empty authority list is not a licence to skip
		// authentication, which is how `checkAuthorities` alone read it.
		expect(get('/reports', anonymous).decision).toBe('UNAUTHENTICATED');
		expect(get('/profile', anonymous).decision).toBe('UNAUTHENTICATED');
		expect(get('/legacy', anonymous).decision).toBe('UNAUTHENTICATED');
	});

	it('separates "not signed in" from "not allowed"', () => {
		// Same route, same missing authority — but the answers must differ, or
		// a UI cannot tell an expired session from a forbidden one.
		expect(get('/reports', anonymous, 'POST').decision).toBe('UNAUTHENTICATED');
		expect(get('/reports', user, 'POST').decision).toBe('DENY');
	});

	it('lets a signed-in caller through a rule with no authority requirement', () => {
		expect(get('/reports', user).decision).toBe('ALLOW');
		expect(get('/profile', user).decision).toBe('ALLOW');
	});

	it('treats a confidential client as authenticated', () => {
		// client_credentials tokens name no user, only a client.
		expect(get('/profile', { clientId: 'svc-1' } as any).decision).toBe(
			'ALLOW',
		);
	});

	it('lets anonymous callers reach a rule marked public', () => {
		// Share links carry their own credential; the service checks the
		// token, password and expiry itself.
		expect(get('/shares/abc', anonymous).decision).toBe('ALLOW');
	});

	it('leaves unmatched paths open, as before', () => {
		expect(get('/unknown', anonymous).decision).toBe('NOT_APPLICABLE');
	});
});

describe('compilePolicy — contradictory rule', () => {
	it('refuses a rule that is both authenticated and public', () => {
		expect(() =>
			compilePolicy({
				rest: { '/x': { GET: { authenticated: true, public: true } } },
			} as Rules),
		).toThrow(/contradictory/);
	});
});

describe('evaluateGraphql — authentication floor', () => {
	it('applies the same floor and the same opt-out as REST', () => {
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

		expect(run('me', {}).decision).toBe('UNAUTHENTICATED');
		expect(run('me', { sub: 'user-1' }).decision).toBe('ALLOW');
		expect(run('publicFeed', {}).decision).toBe('ALLOW');
	});
});
