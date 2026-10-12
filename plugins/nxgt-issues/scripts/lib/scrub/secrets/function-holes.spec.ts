import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('functions that compare a header to a literal secret', () => {
	test.each([
		"const isGateway = (c: Context) => c.req.header('x-gw') === 'k3J9xQ2mZp7vR4tL'",
		"const checkGateway = async (c) => { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' }",
		"const verifyCaller = function (c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' }",
		"{ trustedGateway(c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' } }",
		"{ async trustedGateway(c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' } }",
		"trustedGateway: (c) => constantTimeEqual(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => safeEqual(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => secureCompare(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => c.req.header('x')?.includes('k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => ['k3J9xQ2mZp7vR4tL'].includes(c.req.header('x'))",
		"trustedGateway: (c) => new Set(['k3J9xQ2mZp7vR4tL']).has(c.req.header('x'))",
		"trustedGateway: (c) => c.req.header('x')?.startsWith('k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => Object.is(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => 'k3J9xQ2mZp7vR4tL'.includes(c.req.header('x'))",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"const isGateway = (c: Context) => c.req.header('x-gw') === secret",
		"const getUser = (c) => c.req.header('x-user') === 'k3J9xQ2mZp7vR4tL'",
		"{ trustedGateway(c) { return c.req.header('x-gateway') === secret } }",
		"trustedGateway: (c) => ['GET', 'HEAD'].includes(c.req.method)",
		"trustedGateway: (c) => c.req.header('x')?.startsWith('Bearer')",
	])('%p passes', passes);
});

describe('verify keys compare ordinary values', () => {
	test.each([
		"{ verify: (method) => method === 'GET' || method === 'HEAD' }",
		"{ verifyRequest: (c) => c.req.header('content-type') === 'application/json' }",
		"{ verify: (s) => s.status === 'active' && s.kind !== 'refresh_token' }",
	])('%p passes', passes);

	test.each([
		"{ verify: (p) => p === 'changeme' }",
		"{ verify: (p) => p === 'Hunter2!' }",
		"{ verify: (p) => p === 'k3J9xQ2mZp7vR4tL' }",
		"{ verify: (p) => p === 'jwt-secret' }",
		"{ verify: () => 'GET' }",
		"{ verify: (h, cb) => cb(null, 'GET') }",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
