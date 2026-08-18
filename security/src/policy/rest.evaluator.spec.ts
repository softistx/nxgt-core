import { describe, expect, it } from 'bun:test';
import { evaluateRest } from './rest.evaluator';
import type { Rules } from './rules.schema';

describe('evaluateRest — $domain authority templating', () => {
	it("does not leak one request's domain substitution into the next", () => {
		// Single shared `rules` document, exactly as a service loads it once at
		// startup via `RulesSchema.parse(...)` and reuses for every request.
		const rules: Rules = {
			rest: {
				'/orgs/:domain/widgets': {
					GET: {
						authorities: [['SCOPE_oauth:$domain']],
					},
				},
			},
		};

		const claimsForAcme = { sub: 'user-1', authorities: ['SCOPE_oauth:acme'] };
		const claimsForOther = {
			sub: 'user-2',
			authorities: ['SCOPE_oauth:other'],
		};

		const first = evaluateRest(rules, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/acme/widgets',
			claims: claimsForAcme,
		});
		expect(first.decision).toBe('ALLOW');

		// A second request for a DIFFERENT domain, with claims that only satisfy
		// that second domain, must be evaluated independently — the first
		// request must not have permanently baked "acme" into the shared rule.
		const second = evaluateRest(rules, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/other/widgets',
			claims: claimsForOther,
		});
		expect(second.decision).toBe('ALLOW');

		// And a request for "other" with claims that only satisfy "acme" must
		// still be denied — proving the substitution is truly per-request.
		const thirdDeniedForWrongDomain = evaluateRest(rules, {
			type: 'rest',
			method: 'GET',
			path: '/orgs/other/widgets',
			claims: claimsForAcme,
		});
		expect(thirdDeniedForWrongDomain.decision).toBe('DENY');
	});
});
