import { describe, expect, it } from 'bun:test';
import {
	checkAuthorities,
	compileFunction,
	evalExpression,
	runCompiledExpression,
} from './evaluation.utils';

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

// A rule expression that throws is a denial, never a server error: a typo in
// a rule, or a claim missing from the token, must refuse the request.
describe('evalExpression', () => {
	it('passes on a truthy result, reading the scope by name', () => {
		expect(
			evalExpression(
				{ value: 'claims.sub === args.ownerId' },
				{ claims: { sub: 'u1' }, args: { ownerId: 'u1' } },
			),
		).toEqual({ passed: true, message: '' });
	});

	it('denies on a falsy result with the rule message, or the default one', () => {
		expect(
			evalExpression(
				{ value: 'claims.sub === "u2"', message: 'Not the owner' },
				{ claims: { sub: 'u1' } },
			),
		).toEqual({ passed: false, message: 'Not the owner' });
		expect(evalExpression({ value: 'false' }, {})).toEqual({
			passed: false,
			message: 'Expression check failed',
		});
	});

	it('denies, without throwing, when the expression throws at run time', () => {
		const result = evalExpression(
			{ value: 'claims.org.id === "o1"', message: 'Wrong org' },
			{ claims: { sub: 'u1' } },
		);
		expect(result.passed).toBe(false);
		expect(result.message).toStartWith('Wrong org — ');
		expect(result.message).toContain('undefined');
	});

	it('denies, without throwing, when the expression does not parse', () => {
		const result = evalExpression({ value: 'claims.sub ===' }, { claims: {} });
		expect(result.passed).toBe(false);
		expect(result.message).toStartWith('Expression check failed — ');
	});

	it('denies a non-Error throw too, naming it', () => {
		expect(
			evalExpression({ value: '(() => { throw "nope"; })()' }, {}),
		).toEqual({ passed: false, message: 'Expression check failed — nope' });
	});
});

describe('runCompiledExpression', () => {
	const compiled = (body: string, message = 'Denied') => ({
		fn: compileFunction(`return (${body});`, 'claims', 'args'),
		message,
	});

	it('passes on a truthy result and denies on a falsy one', () => {
		const owner = compiled('claims.sub === args.ownerId', 'Not the owner');
		expect(
			runCompiledExpression(owner, { sub: 'u1' }, { ownerId: 'u1' }),
		).toEqual({ passed: true, message: '' });
		expect(
			runCompiledExpression(owner, { sub: 'u1' }, { ownerId: 'u2' }),
		).toEqual({ passed: false, message: 'Not the owner' });
	});

	it('denies, without throwing, when the compiled function throws', () => {
		const result = runCompiledExpression(
			compiled('claims.org.id === "o1"', 'Wrong org'),
			{ sub: 'u1' },
			{},
		);
		expect(result.passed).toBe(false);
		expect(result.message).toStartWith('Wrong org — ');
	});

	it('denies a non-Error throw, naming it', () => {
		const throwing = {
			fn: () => {
				throw 42;
			},
			message: 'Denied',
		};
		expect(runCompiledExpression(throwing)).toEqual({
			passed: false,
			message: 'Denied — 42',
		});
	});
});
