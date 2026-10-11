import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('status phrases with a tail', () => {
	test.each([
		'password: not set, token: (empty)',
		'token: (empty) in the test env.',
		'password: is required; secret: not provided',
	])('%p passes', passes);

	test.each(['password: not set hunter2', 'password: not set, token: hunter2'])(
		'%p refuses',
		(text) => {
			expect(refused(text)).toBe(true);
		},
	);
});

describe('literals concatenated to or inside a scheme', () => {
	test.each([
		"Authorization: 'Bearer ' + 'k3J9xQ2mZp7vR4tL'",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"Authorization: `Bearer ${'k3J9xQ2mZp7vR4tL'}`",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Basic ${'YWRtaW46aHVudGVyMg=='}`",
		"'Bearer ' + token + 'k3J9xQ2mZp7vR4tL'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"Authorization: 'Bearer ' + token",
		"'Basic ' + btoa(user + ':' + pass)",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Bearer ${tokens['access']}`",
	])('%p passes', passes);
});

describe('SDL blocks and YAML sequences', () => {
	test.each([
		'type Env { GATEWAY_SECRET: K3J9xQ2mZp7vR4tL }',
		'type Env { secret: ABCDEFGH }',
		'passwords: [hunter2, swordfish]',
		'secret: [K3J9xQ2mZp7vR4tL]',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'type User { id: ID! }',
		'input X { file: Upload! }',
		'input LoginInput { password: Password! }',
		'roles: [admin, user]',
		'const cookieSecret = [process.env.COOKIE_SECRET]',
		'secrets: [oldSecret, newSecret]',
	])('%p passes', passes);
});
