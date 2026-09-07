import { describe, expect, it } from 'bun:test';
import type { OryPrincipal } from 'stx-sdk/ory';
import { checkAuthorities, isAuthenticated } from '../../policy';
import { claimsFromOryPrincipal } from './claims';

const sessionExpiry = new Date('2026-09-07T12:00:00.000Z');

const session: OryPrincipal = {
	subject: 'idn-7',
	kind: 'session',
	identity: {
		email: 'ada@example.test',
		name: { first: 'Ada', last: 'Lovelace' },
		verified: true,
	},
	aal: 'aal2',
	scopes: [],
	expiresAt: sessionExpiry,
};

const token: OryPrincipal = {
	subject: 'client-42',
	kind: 'token',
	scopes: ['read:notes', 'write:notes'],
	clientId: 'client-42',
	audience: ['notes-api'],
};

describe('claimsFromOryPrincipal', () => {
	it('names a Kratos session in the OIDC vocabulary', () => {
		expect(claimsFromOryPrincipal(session)).toEqual({
			sub: 'idn-7',
			kind: 'session',
			email: 'ada@example.test',
			email_verified: true,
			aal: 'aal2',
			exp: 1_788_782_400,
		});
	});

	it('names a Hydra token, scopes joined the way `checkAuthorities` splits them', () => {
		const claims = claimsFromOryPrincipal(token);

		expect(claims).toEqual({
			sub: 'client-42',
			kind: 'token',
			clientId: 'client-42',
			aud: ['notes-api'],
			scope: 'read:notes write:notes',
		});
		// The round trip that matters: a scope IS an authority to a rules file,
		// and this is the only way an Ory caller satisfies an authority group.
		expect(checkAuthorities({ authorities: [['read:notes']] }, claims)).toBe(
			true,
		);
		expect(checkAuthorities({ authorities: [['admin:notes']] }, claims)).toBe(
			false,
		);
	});

	it('writes `exp` as seconds, not milliseconds and not an ISO string', () => {
		const { exp } = claimsFromOryPrincipal(session);

		// The bug this mapper exists to end: the REST middleware wrote
		// `expiresAt.toISOString()` into a field declared `number`, so
		// `claims.exp < Date.now() / 1000` compared a string to a number and
		// was false for every value it could ever hold.
		expect(typeof exp).toBe('number');
		expect(exp).toBe(Math.floor(sessionExpiry.getTime() / 1000));
	});

	it('omits what the caller does not have, rather than sending it empty', () => {
		const claims = claimsFromOryPrincipal({
			subject: 'idn-9',
			kind: 'session',
			scopes: [],
		});

		expect(claims).toEqual({ sub: 'idn-9', kind: 'session' });
		expect('email' in claims).toBe(false);
		expect('scope' in claims).toBe(false);
		expect('exp' in claims).toBe(false);
	});

	it('gives an Ory caller no authorities at all', () => {
		const claims = claimsFromOryPrincipal(session);

		// Keto answers per object; an authority list here would be a second,
		// coarser answer to the same question, and an accidental grant.
		expect(claims.authorities).toBeUndefined();
		expect(claims.roles).toBeUndefined();
		expect(claims.permissions).toBeUndefined();
		// A rule asking for one therefore refuses, and says so rather than
		// passing on an empty requirement.
		expect(checkAuthorities({ authorities: [['ADMIN']] }, claims)).toBe(false);
	});

	it('makes every resolved caller authenticated, session or token', () => {
		expect(isAuthenticated(claimsFromOryPrincipal(session))).toBe(true);
		expect(isAuthenticated(claimsFromOryPrincipal(token))).toBe(true);
	});
});
