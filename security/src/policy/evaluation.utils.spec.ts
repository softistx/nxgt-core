import { describe, expect, it } from 'bun:test';
import { checkAuthorities } from './evaluation.utils';

describe('checkAuthorities', () => {
	const rule = { authorities: [['ADMIN']] };

	it('passes when satisfied via claims.authorities', () => {
		expect(checkAuthorities(rule, { sub: 'u1', authorities: ['ADMIN'] })).toBe(
			true,
		);
	});

	it('passes when satisfied via claims.roles', () => {
		expect(checkAuthorities(rule, { sub: 'u1', roles: ['ADMIN'] })).toBe(true);
	});

	it('passes when satisfied via a space-separated claims.scope token', () => {
		expect(
			checkAuthorities(rule, { sub: 'u1', scope: 'openid ADMIN profile' }),
		).toBe(true);
	});

	it('denies when none of authorities/roles/scope contain the required value', () => {
		expect(
			checkAuthorities(rule, {
				sub: 'u1',
				authorities: ['OTHER'],
				roles: ['OTHER'],
				scope: 'openid profile',
			}),
		).toBe(false);
	});

	it('denies when claims have no authorities/roles/scope at all', () => {
		expect(checkAuthorities(rule, { sub: 'u1' })).toBe(false);
	});
});
