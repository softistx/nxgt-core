import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('literals inside function values', () => {
	test.each([
		"oryAuth(ory, { trustedGateway: (c) => c.req.header('x-gateway') === 'k3J9xQ2mZp7vR4tL' })",
		"useAuth({ trustedGateway: ({ request }) => request.headers.get('x-gw') === 'k3J9xQ2mZp7vR4tL' })",
		"oryAuth(ory, { trustedGateway: (c) => timingSafeEqual(c.req.header('x-gw'), 'k3J9xQ2mZp7vR4tL') })",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === 'k3J9xQ2mZp7vR4tL' })",
		"jwt.verify(token, (header, cb) => cb(null, 'k3J9xQ2mZp7vR4tL'))",
		"oryAuth(ory, { trustedGateway: () => 'k3J9xQ2mZp7vR4tL' })",
		"gatewaySecret(() => 'k3J9xQ2mZp7vR4tL')",
		"jwt.sign(p, (() => 'mysecret')())",
		"currentUser({ trustedGateway: (c) => c.req.header('x') === 'k3J9xQ2mZp7vR4tL' })",
		"extractJwtPlugin({ trustedGateway: (req) => req.headers.get('x') === 'k3J9xQ2mZp7vR4tL' })",
		"plugin({ getToken: function () { return 'k3J9xQ2mZp7vR4tL' } })",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"oryAuth(ory, { trustedGateway: (c) => c.req.header('x-gateway') === secret })",
		"login(page, async () => { await page.click('#submit') })",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === password })",
		"currentUser({ trustedGateway: (c) => c.req.header('x-gateway') === env.GW })",
	])('%p passes', passes);
});

describe('arrows and function words inside string literals', () => {
	test.each([
		"jwt.sign(p, 'k3J9=>xQ2mZp7vR4tL')",
		"gatewaySecret('function-k3J9xQ2mZp7vR4tL')",
		"login(page, 'admin', 'pa=>ss-k3J9xQ2mZp7vR4tL')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('parenthesised scheme operands', () => {
	test.each([
		"headers: { Authorization: 'Bearer ' + (process.env.TOKEN ?? 'k3J9xQ2mZp7vR4tL') }",
		"'Bearer ' + (dev ? 'k3J9xQ2mZp7vR4tL' : token)",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"'Bearer ' + (process.env.TOKEN ?? token)",
		"'Bearer ' + (a || b)",
	])('%p passes', passes);
});
