import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('a compared literal whose other operand is a credential', () => {
	test.each([
		"basicAuth({ verifyUser: (username, password, c) => { return username === 'hono' && password === 'acoolproject' } })",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === 'swordfish' })",
		"{ verify: (u, p) => u === 'admin' && p === 'opensesame' }",
		"{ verify: (p) => p === 'my_secret_value' }",
		"{ verify: (input) => input.password === 'swordfish' }",
		"trustedGateway: (c) => c.req.header('x-gateway') === 'super_secret_gateway_key'",
		"{ verifyToken: (t) => 'swordfish' === t.token }",
		"const checkKey = (req) => req.apiKey === 'swordfish'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"{ verify: (method) => method === 'GET' }",
		"{ verifyRequest: (c) => c.req.header('content-type') === 'application/json' }",
		"{ verify: (s) => s.status === 'active' && s.kind !== 'refresh_token' }",
		"{ verify: (u, p) => u.role === 'admin' }",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === password })",
	])('%p passes', passes);
});

describe('scope and permission literals are not user:pass', () => {
	test.each([
		"export const checkScope = (claims) => claims.scope?.includes('read:users') ?? false",
		"const checkScopes = (c) => c.scopes.includes('write:org')",
		"const isAdmin = (c) => c.permissions.includes('admin:all')",
		"const checkRole = (c) => c.roles.includes('team:lead')",
		"const checkScope = (s) => s === 'read:users'",
		"const hasPermission = (c) => ['read:users', 'write:org'].includes(c.scope)",
	])('%p passes', passes);

	test.each([
		"const checkScope = (claims) => claims.scope?.includes('admin:Hunter2')",
		"const checkCaller = (c) => c.header === 'svc:k3J9xQ2mZp7vR4tL'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('credential headers, header lists and base64 encoders', () => {
	test.each([
		'curl -H "x-gateway-secret: $GATEWAY_SECRET" http://localhost:4000/graphql',
		"redact: ['authorization', 'cookie']",
		"const redact = ['authorization', 'x-api-key', 'set-cookie']",
	])('%p passes', passes);

	test.each([
		'curl -H "x-gateway-secret: k3J9xQ2mZp7vR4tL" http://localhost:4000/graphql',
		"'Basic ' + toBase64('admin:swordfish')",
		"'Basic ' + base64Encode('admin:swordfish')",
		"'Basic ' + b64('admin:swordfish')",
		"'Basic ' + encodeBase64('admin:swordfish')",
		"const auth = 'Basic ' + toBase64('admin:swordfish')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
