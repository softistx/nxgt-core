import { describe, expect, it } from 'bun:test';
import {
	assertGatewaySecret,
	GATEWAY_SECRET_HEADER,
	gatewaySecret,
	requireGatewayTrust,
} from './gateway-trust';

const SECRET = 'a-gateway-secret-of-32-characters';

describe('gatewaySecret', () => {
	const trusted = gatewaySecret({ secret: SECRET });

	it('holds for the secret, whatever the header case', () => {
		expect(trusted(new Headers({ [GATEWAY_SECRET_HEADER]: SECRET }))).toBe(
			true,
		);
		expect(trusted(new Headers({ 'X-Gateway-Secret': SECRET }))).toBe(true);
	});

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
			'gatewaySecret(): `secret` must be a string of at least 16 characters — is its environment variable set?',
		);
	});
});

describe('assertGatewaySecret', () => {
	it('names its caller', () => {
		expect(() => assertGatewaySecret('short', 'mockAuthMiddleware()')).toThrow(
			/^mockAuthMiddleware\(\): `secret` must be/,
		);
		expect(assertGatewaySecret(SECRET, 'x()')).toBe(SECRET);
	});
});

describe('requireGatewayTrust', () => {
	const site = {
		caller: 'currentUser()',
		reads: 'the X-User-* headers',
		alternative: 'oryAuth(ory)',
	};

	it('names the caller, what the client writes and the fix', () => {
		expect(() => requireGatewayTrust(undefined, site)).toThrow(
			'currentUser(): name the gateway allowed to set the caller — currentUser({ trustedGateway: gatewaySecret({ secret }) }). The X-User-* headers are written by the client; an API that resolves its own callers uses oryAuth(ory)',
		);
		expect(() => requireGatewayTrust({}, site)).toThrow(TypeError);
		expect(() =>
			requireGatewayTrust({ trustedGateway: true as never }, site),
		).toThrow(TypeError);
	});

	it('writes the call it is given', () => {
		expect(() =>
			requireGatewayTrust(undefined, {
				...site,
				call: 'f(ctx, { trustedGateway: gatewaySecret({ secret }) })',
			}),
		).toThrow(
			'currentUser(): name the gateway allowed to set the caller — f(ctx, { trustedGateway: gatewaySecret({ secret }) }). The X-User-*',
		);
	});

	it('hands back the trust it was given', () => {
		const trust = () => true;
		expect(requireGatewayTrust({ trustedGateway: trust }, site)).toBe(trust);
	});
});
