import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('a name that only starts or contains a credential word is not a credential', () => {
	test.each([
		"if (session.tokenType === 'refresh_token') {}",
		"if (data.token_type !== 'Bearer') {}",
		"if (body.token_type === 'bearer') {}",
		"if (tokenType === 'access') {}",
		"if (keyType === 'rsa') {}",
		"if (secretType === 'opaque') {}",
		"if (passwordStrength === 'weak') {}",
		"if (passwordPolicy === 'strict') {}",
		"if (secretManager === 'vault') {}",
		"if (tokenSource === 'cookie') {}",
		"if (tokenLocation === 'header') {}",
		"if (tokenEndpointAuthMethod === 'client_secret_post') {}",
		"if (sortKey === 'createdAt') {}",
		"if (primaryKey === 'id') {}",
		"if (storageKey === 'theme') {}",
		"if (cacheKey === 'v2') {}",
		"if (lexer.token === 'EOF') {}",
		"if ('weak' === passwordStrength) {}",
	])('%p passes', passes);

	test.each([
		"if (req.body.password === 'swordfish') {}",
		"if (userPassword === 'swordfish') {}",
		"if (c.req.header('x-api-key') !== 'acoolproject') {}",
		"if (config.apiKey === 'acoolproject') {}",
		"if (signingKey === 'acoolproject') {}",
		"if (secretKey !== 'acoolproject') {}",
		"if (privateKey === 'acoolproject') {}",
		"if (token === 'acoolproject') {}",
		"if ('acoolproject' === password) {}",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('a predicate named isSecret compares field types', () => {
	test.each([
		"const isSecret = (field) => field.type === 'password'",
		'function isPasswordField(f) { return f.type === "password"; }',
		"const isTokenField = (f) => f.kind === 'token'",
	])('%p passes', passes);

	test.each([
		"const isSecret = (input) => input === 'swordfish1'",
		"const isPasswordField = (f) => f.password === 'swordfish'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
