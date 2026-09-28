import { describe, expect, it } from 'bun:test';
import { version } from 'graphql';
import {
	GATEWAY_SECRET_HEADER,
	gatewaySecret,
	principalOf,
	requireGatewayTrust,
} from './gateway-trust';

/**
 * Apollo Server 5 peers graphql ^16 and `require()`s it, which graphql 17 —
 * ESM only — refuses. So the Apollo cases run on graphql 16 and are skipped
 * by `test:graphql17`, where Apollo cannot load at all.
 */
const ON_APOLLO = version.startsWith('16.');
const apollo = ON_APOLLO
	? await import('@apollo/server')
	: ({} as typeof import('@apollo/server'));

const SECRET = 'a-gateway-secret-of-32-characters';

describe('gatewaySecret', () => {
	const trusted = gatewaySecret({ secret: SECRET });

	it('holds for the secret in fetch Headers', () => {
		expect(trusted(new Headers({ [GATEWAY_SECRET_HEADER]: SECRET }))).toBe(
			true,
		);
	});

	it.skipIf(!ON_APOLLO)(
		'holds for it in Apollo HeaderMap, whatever the case',
		() => {
			const map = new apollo.HeaderMap();
			map.set('X-Gateway-Secret', SECRET);
			expect(trusted(map)).toBe(true);
		},
	);

	it.each([
		['no header', new Headers()],
		['an empty header', new Headers({ [GATEWAY_SECRET_HEADER]: '' })],
		['a wrong secret', new Headers({ [GATEWAY_SECRET_HEADER]: 'guess' })],
		[
			'the secret plus one character',
			new Headers({ [GATEWAY_SECRET_HEADER]: `${SECRET}x` }),
		],
		[
			'a prefix of the secret',
			new Headers({ [GATEWAY_SECRET_HEADER]: SECRET.slice(0, -1) }),
		],
	])('refuses %s', (_, headers) => {
		expect(trusted(headers)).toBe(false);
	});

	it('reads the header it is told to', () => {
		const custom = gatewaySecret({ secret: SECRET, header: 'x-mesh' });
		expect(custom(new Headers({ 'x-mesh': SECRET }))).toBe(true);
		expect(custom(new Headers({ [GATEWAY_SECRET_HEADER]: SECRET }))).toBe(
			false,
		);
	});

	it.each([
		['undefined', undefined],
		['empty', ''],
		['short', 'fifteen-chars!!'],
	])('refuses a secret that is %s when it is built', (_, secret) => {
		expect(() => gatewaySecret({ secret: secret as string })).toThrow(
			TypeError,
		);
	});
});

describe('requireGatewayTrust', () => {
	it('names the plugin and the fix when no gateway is given', () => {
		expect(() => requireGatewayTrust(undefined, 'useAuth()')).toThrow(
			/useAuth\(\): name the gateway allowed to set the caller/,
		);
		expect(() => requireGatewayTrust({}, 'useAuth()')).toThrow(TypeError);
	});
});

describe('principalOf', () => {
	it('takes an object with a non-empty string sub, and nothing else', () => {
		expect(principalOf({ sub: 'idn-1' })).toEqual({ sub: 'idn-1' } as never);
		for (const value of [
			undefined,
			null,
			'idn-1',
			{},
			{ sub: '' },
			{ sub: 7 },
		]) {
			expect(principalOf(value)).toBeUndefined();
		}
	});
});
