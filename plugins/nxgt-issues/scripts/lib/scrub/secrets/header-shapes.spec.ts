import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

describe('credential headers, cookies and flags in other shapes', () => {
	test.each([
		"res.cookie('sid', 'abc123def456')",
		"headers['authorization'] = 'Basic YWRtaW46aHVudGVy'",
		"req.headers['x-gateway-secret'] = 'gateway-value'",
		"new Headers([['authorization', 'Basic YWRtaW46aHVudGVy']])",
		"spawn('psql', ['--password', 'hunter2'])",
		"execa('pg_dump', ['-W', 'hunter2', 'db'])",
		"['--token', 'abc123']",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"res.cookie('sid', value, { httpOnly: true })",
		"headers['content-type'] = 'application/json'",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"headers['authorization'] = `Bearer ${token}`",
		"new Headers([['accept', 'application/json']])",
		"spawn('psql', ['--password', password])",
		"['--verbose', 'yes']",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});
