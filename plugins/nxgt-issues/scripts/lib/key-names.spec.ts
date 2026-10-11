import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const secretsOf = (text: string) => scrub(text, {}).secrets;

describe('key names with short values', () => {
	test.each([
		'MASTER_KEY=Zq8wLmP3vTnR',
		'SIGNING_KEY=abcd1234efgh',
		'JWT_SIGNING=abcd1234efgh',
		'HMAC_KEY: Zq8wLmP3vTnR',
		"const signingKey = 'Zq8wLmP3vTnR'",
		"const encryptionKey = 'Zq8wLmP3vTnR'",
		'{"key": "Zq8wLmP3vTnR"}',
		"const key = 'AbC9xYz1QwErTy'",
		"const signingKey = 'users'",
		'KEY=Zq8wLmP3vTnR',
	])('%p refuses', (text) => {
		expect(secretsOf(text)).toContain('key');
	});

	test.each([
		'key: string',
		'key: process.env.KEY',
		'<li key={id}>',
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'key: `user:${id}`',
		"{ key: 'id', label: 'Name' }",
		"foreignKey: 'userId'",
		'primaryKey: true',
		"sortKey: 'createdAt'",
		'monkey: banana',
		'keyboard: qwerty',
		"i18nKey: 'auth.login.title'",
		"storageKey: 'theme-v2'",
		"partitionKey: 'tenant1234'",
		"const keyId = 'kid-2024'",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'const cacheKey = `users:${id}`',
	])('%p passes', (text) => {
		expect({ text, secrets: secretsOf(text) }).toEqual({ text, secrets: [] });
	});
});
