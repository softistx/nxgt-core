import { describe, expect, test } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { currentUser } from './current-user';
import { createErrorHandler } from './error-handler';
import {
	GATEWAY_SECRET_HEADER,
	type GatewayTrust,
	gatewaySecret,
} from './gateway-trust';
import { secured } from './secured';

const SECRET = 'a-gateway-secret-of-32-characters';

/** What a client reaching the service directly can send: anyone's name. */
const forged = {
	[USER_HEADERS.ID]: 'someone-else',
	[USER_HEADERS.USERNAME]: 'admin@example.test',
	[USER_HEADERS.EMAIL]: 'admin@example.test',
	[USER_HEADERS.AUTHORITIES]: 'ADMIN,users:write',
	[USER_HEADERS.ROLES]: 'ADMIN',
	[USER_HEADERS.SCOPES]: 'openid',
	[USER_HEADERS.CLIENT]: 'backoffice',
};

function app(trustedGateway: GatewayTrust = gatewaySecret({ secret: SECRET })) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	hono.use('*', currentUser({ trustedGateway }));
	hono.get('/me', (ctx) =>
		ctx.json({
			principal: ctx.get('principal') ?? null,
			id: ctx.get(USER_HEADERS.ID) ?? null,
			roles: ctx.get(USER_HEADERS.ROLES) ?? null,
		}),
	);
	hono.get('/admin', secured([['ADMIN']]), (ctx) => ctx.text('granted'));
	return hono;
}

describe('currentUser — setup', () => {
	test.each([
		['no options', undefined],
		['no trustedGateway', {}],
		['a trustedGateway that is not a function', { trustedGateway: true }],
	])('throws with %s', (_, options) => {
		expect(() => currentUser(options as never)).toThrow(
			'currentUser(): name the gateway allowed to set the caller — currentUser({ trustedGateway: gatewaySecret({ secret }) }). The X-User-* headers are written by the client; an API that resolves its own callers uses oryAuth(ory)',
		);
	});

	test('throws when the gateway secret is unset', () => {
		expect(() =>
			currentUser({
				trustedGateway: gatewaySecret({ secret: undefined as never }),
			}),
		).toThrow(TypeError);
	});
});

describe('currentUser — a forged caller', () => {
	test.each([
		['no gateway secret', {}],
		['an empty gateway secret', { [GATEWAY_SECRET_HEADER]: '' }],
		['a wrong gateway secret', { [GATEWAY_SECRET_HEADER]: 'guess' }],
		[
			'a prefix of the secret',
			{ [GATEWAY_SECRET_HEADER]: SECRET.slice(0, -1) },
		],
	])('is nobody with %s', async (_, proof) => {
		const response = await app().request('/me', {
			headers: { ...forged, ...proof },
		});
		expect(await response.json()).toEqual({
			principal: null,
			id: null,
			roles: null,
		});
	});

	test('cannot pass secured(), which answers 401', async () => {
		const response = await app().request('/admin', { headers: forged });
		expect(response.status).toBe(401);
	});

	test('is nobody when the custom trust refuses', async () => {
		const response = await app(async () => false).request('/me', {
			headers: forged,
		});
		expect((await response.json()).principal).toBeNull();
	});
});

describe('currentUser — a caller the gateway names', () => {
	test('is read from the headers, with the secret', async () => {
		const response = await app().request('/me', {
			headers: { ...forged, [GATEWAY_SECRET_HEADER]: SECRET },
		});
		const body = await response.json();
		expect(body.principal).toMatchObject({
			id: 'someone-else',
			name: 'admin@example.test',
			authorities: ['ADMIN', 'users:write'],
			roles: ['ADMIN'],
			scopes: ['openid'],
			clientId: 'backoffice',
		});
		expect(body.id).toBe('someone-else');
		expect(body.roles).toEqual(['ADMIN']);
	});

	test('passes secured() on its authorities', async () => {
		const response = await app().request('/admin', {
			headers: { ...forged, [GATEWAY_SECRET_HEADER]: SECRET },
		});
		expect(response.status).toBe(200);
	});

	test('is read when a custom trust, async, vouches for it', async () => {
		const trust: GatewayTrust = async (headers) =>
			headers.get('x-mtls-verified') === 'yes';
		const response = await app(trust).request('/me', {
			headers: { ...forged, 'x-mtls-verified': 'yes' },
		});
		expect((await response.json()).principal).toMatchObject({
			id: 'someone-else',
		});
	});

	test('a trusted request naming nobody is anonymous', async () => {
		const response = await app().request('/me', {
			headers: { [GATEWAY_SECRET_HEADER]: SECRET },
		});
		expect((await response.json()).principal).toBeNull();
	});
});
