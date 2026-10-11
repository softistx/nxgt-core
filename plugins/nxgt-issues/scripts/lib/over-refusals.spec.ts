import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

describe('reading a bearer token from a request', () => {
	test.each([
		"const token = c.req.header('authorization')?.replace('Bearer ', '')",
		"const token = c.req.header('authorization')?.replace(/^Bearer /, '')",
		"const token = c.req.header('authorization')?.slice(7)",
		"const token = c.req.header('authorization')?.split(' ')[1]",
		'const token = req.headers.authorization?.replace(/^Bearer /, "")',
	])('%p passes', passes);

	test.each([
		"const token = c.req.header('authorization')?.replace('Bearer ', 'k3J9xQ2mZp7vR4tL')",
		"const token = cleanup('Bearer ', 'k3J9xQ2mZp7vR4tL')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('an error class and its message inside JSON', () => {
	test.each([
		'{"error":"JsonWebTokenError: invalid signature"}',
		'"message": "TokenExpiredError: jwt expired"',
		"{ error: 'JsonWebTokenError: jwt malformed' }",
		'{"error":"JsonWebTokenError: invalid signature"},',
	])('%p passes', passes);

	test.each([
		'{"token":"JsonWebTokenError: k3J9xQ2mZp7vR4tL"}',
		'"password": "hunter two"',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('shell variables are placeholders', () => {
	test.each([
		'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" https://api.example.com/x',
		'curl -u "$USER:$PASS" https://api.example.com/x',
		`curl -u \${USER}:\${PASS} https://api.example.com/x`,
		'curl -H "Authorization: Basic $(echo -n "$U:$P" | base64)" https://api.example.com/x',
		'curl -H "Authorization: Bearer $TOKEN" https://api.example.com/x',
	])('%p passes', passes);

	test.each([
		'curl -u admin:hunter2 https://api.example.com/x',
		'curl -u "admin:Hunter2!" https://api.example.com/x',
		'curl -u "$USER:Hunter2!" https://api.example.com/x',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
