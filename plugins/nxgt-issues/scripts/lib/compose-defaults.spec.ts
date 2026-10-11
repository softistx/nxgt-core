// biome-ignore-all lint/suspicious/noTemplateCurlyInString: compose defaults are written as plain strings

import { describe, expect, test } from 'bun:test';
import { findSecrets } from './secrets';

const USERPASS = 'dXNlcjpwYXNz'; // user:pass
const WORD = 'ZXhhbXBsZQ'; // example (no colon)

describe('a Basic scheme followed by a compose default', () => {
	test.each([
		`Authorization: Basic \${CREDS:-${USERPASS}}`,
		`curl -H "Authorization: Basic \${CREDS:-${USERPASS}}" https://x.example`,
		`headers: { Authorization: \`Basic \${CREDS:-${USERPASS}}\` }`,
		`Authorization: Basic \${CREDS:=${USERPASS}=}`,
	])('%p refuses', (text) => {
		expect(findSecrets(text)).toContain('authorization');
	});

	test.each([
		`Authorization: Basic \${CREDS:-${WORD}}`,
		'Authorization: Basic ${CREDS}',
		'Authorization: Basic ${CREDS:-}',
		'Authorization: Basic ${CREDS:-<base64>}',
		`headers: { Authorization: \`Basic \${CREDS:-${WORD}}\` }`,
	])('%p passes', (text) => {
		expect(findSecrets(text)).toEqual([]);
	});
});

describe('nested compose defaults', () => {
	test.each([
		'x ${A:-${B:-Bearer hunter2}}',
		'x ${A:-${B:-${C:-Basic hunter2}}}',
		'x ${A:=${B:-Token abc123}}',
	])('%p refuses a short password after a scheme word', (text) => {
		expect(findSecrets(text)).toContain('authorization');
	});

	test.each([
		'x ${A:-${B:-}}',
		'x ${A:-${B:-Bearer <token>}}',
		'x ${A:-${B:-Bearer token}}',
		'x ${A:-${B:-3600}}',
	])('%p passes', (text) => {
		expect(findSecrets(text)).toEqual([]);
	});
});
