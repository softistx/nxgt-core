import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({
		text,
		refused: refused(text),
		secrets: scrub(text, {}).secrets,
	}).toEqual({
		text,
		refused: false,
		secrets: [],
	});

describe('Authorization with a template or concatenated value', () => {
	test.each([
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'{ headers: { Authorization: `Bearer ${token}` } }',
		"Authorization: 'Bearer ' + token",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'Authorization: `Basic ${btoa(`${u}:${p}`)}`',
	])('%p passes', passes);

	test.each([
		'Authorization: Bearer abc123def456ghi',
		'Authorization: `Bearer abc123def456ghi`',
		"Authorization: 'Basic YWRtaW46aHVudGVy'",
		"Authorization: 'Bearer abc123def456ghi' + suffix",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('GraphQL SDL types', () => {
	test.each([
		'  password: String!',
		'input LoginInput { email: String! password: String! }',
		'password: String! @deprecated',
		'type User { id: ID! apiKey: String token: String }',
		'input LoginInput {\n  email: String!\n  password: Password!\n}',
		'secret: [String!]!',
	])('%p passes', passes);

	test.each(['password: Hunter2!', 'password: Opensesame', 'token: Abc123!'])(
		'%p refuses',
		(text) => {
			expect(refused(text)).toBe(true);
		},
	);
});

describe('gateway headers, compound assignments, arrays', () => {
	test.each([
		"{ headers: { [GATEWAY_SECRET_HEADER]: 'k3J9xQ2mZp7vR4tL' } }",
		"headers.set(GATEWAY_SECRET_HEADER, 'k3J9xQ2mZp7vR4tL')",
		"new Headers({ [GATEWAY_SECRET_HEADER]: 'k3J9xQ2mZp7vR4tL' })",
		"process.env.GATEWAY_SECRET ??= 'local-dev-secret-123'",
		"config.token ||= 'abc123def456'",
		"secret: ['s3cr3tkey1']",
		"const cookieSecret = ['s3cr3t-one']",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'{ headers: { [GATEWAY_SECRET_HEADER]: secret } }',
		'headers.set(GATEWAY_SECRET_HEADER, env.GATEWAY_SECRET)',
		"{ [CONTENT_TYPE]: 'application/json' }",
		"secret: ['<redacted>']",
		'const cookieSecret = [process.env.COOKIE_SECRET]',
		'options.timeout ??= 5000',
	])('%p passes', passes);
});

describe('easy wins', () => {
	test.each([
		"curl -H 'Cookie: name=<redacted>'.",
		"curl -H 'Cookie: sid=<redacted>; theme=<redacted>'",
		'password: must contain a digit',
		'password: not set',
		'token: not provided',
		'secret: (empty)',
		'token: undefined',
		"secretName: 'GATEWAY_SECRET'",
		"tokenName: 'API_TOKEN'",
	])('%p passes', passes);

	test.each(["secretName: 'k3J9xQ2mZp7vR4tL'", 'password: must change me'])(
		'%p refuses',
		(text) => {
			expect(refused(text)).toBe(true);
		},
	);
});
