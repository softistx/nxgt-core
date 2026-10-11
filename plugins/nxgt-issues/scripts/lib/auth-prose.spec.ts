import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const secretsOf = (text: string) => scrub(text, {}).secrets;

describe('auth error names and prose after a label', () => {
	test.each([
		'JsonWebTokenError: invalid signature',
		'TokenExpiredError: jwt expired',
		'SessionError: Session not found',
		'AuthError: Unauthorized request',
		'AuthenticationException: bad credentials',
		'password: too short',
		'The token: an opaque string',
		'the secret: it fails',
		'password: is required',
		'token: has expired',
		'api_key: must be set',
	])('%p passes', (text) => {
		expect({ text, secrets: secretsOf(text) }).toEqual({ text, secrets: [] });
	});

	test.each([
		'password: hunter2',
		'PASSWORD=hunter2',
		'password: the hunter2',
		"password: 'correct horse'",
		'token: abc def123',
		'password: open sesame',
		'secret: correct horse battery',
		'db_password: my dog rex',
		'  password: open sesame',
		'config:\n  password: open sesame',
		// Trade-off: prose with no validation or status word refuses.
		'pwd: the cwd',
	])('%p refuses', (text) => {
		expect(secretsOf(text)).not.toEqual([]);
	});
});
