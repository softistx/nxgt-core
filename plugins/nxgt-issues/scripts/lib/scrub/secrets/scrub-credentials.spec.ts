import { describe, expect, test } from 'bun:test';
import { scrub, transform } from './scrub';

const cwd = '/Users/jane/work/secret-app';

describe('scrub: credentials refuse instead of being stripped', () => {
	test.each([
		['password: hunter2', 'password'],
		['PASSWORD=hunter2', 'password'],
		['{"password": "hunter2"}', 'password'],
		['db_pwd = x', 'pwd'],
		['client_secret: abc', 'secret'],
		['api_key=abc', 'api-key'],
		['apiKey: abc', 'api-key'],
		['x-api-key: abc', 'api-key'],
		['token: abc', 'token'],
		['Authorization: Bearer abcd1234.ef', 'authorization'],
	])('%p', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toMatch(/hunter2|abc/);
	});

	test('ordinary prose and placeholders pass', () => {
		for (const text of [
			'the passwords table has a token count',
			'tokens: 3',
			'maxToken: 5',
			'tokenTtl: 3600',
			'passwordMinLength: 8',
			'sessionTimeout: 30m',
			'token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2',
			'secrets are stored elsewhere',
		]) {
			expect(scrub(text, {}).secrets).toEqual([]);
		}
		expect(scrub('token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2', {}).refused).toBe(false);
	});
});

describe('scrub: credentials, wider', () => {
	test.each([
		['DB_PASS=hunter2', 'pass'],
		['secret_key: abc', 'secret'],
		['DB_CREDENTIALS=abc', 'credentials'],
		['private_key = abc', 'private-key'],
		['privateKey: abc', 'private-key'],
		['auth: abc123', 'auth'],
		['Authorization: Basic dXNlcjpwdw==', 'authorization'],
		['Authorization: token ghx12345', 'authorization'],
		['curl -H "Authorization: Bearer abcd1234efgh"', 'authorization'],
		['uses Bearer abcd1234efgh', 'bearer'],
		['-----BEGIN RSA PRIVATE KEY-----', 'private-key-block'],
		['-----BEGIN PRIVATE KEY-----', 'private-key-block'],
		['password: <hunter2>x', 'password'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
	});

	test.each([
		'The bearer token is read from the header',
		'Bearer tokens expire',
		'Bearer authentication',
		'password: string;',
		'interface Opts { token: string; secret?: string }',
		'pass the token = undefined',
		'set apiKey: process.env.KEY',
		'Error: password: required',
		'token: <redacted>',
		'password: ****',
		'secret: string[]',
		'const author: Person; bypass: true; compass: the one',
		'Authorization: Bearer token',
		'token: import.meta.env.TOKEN',
	])('%p passes', (text) => {
		const result = scrub(text, {});
		expect(result.secrets).toEqual([]);
		expect(result.refused).toBe(false);
	});
});

describe('scrub: credentials under unknown names', () => {
	test.each([
		['PGPASSWORD=hunter2 psql', 'password'],
		['REDISPASS=hunter2', 'pass'],
		['dbpassword=hunter2', 'password'],
		['mysql -u root --password hunter2', 'password'],
		['tool --token=abc123', 'token'],
		['tool --api-key abc123', 'api-key'],
		['tool --secret s3cr3t', 'secret'],
		['mysql -u root -phunter2 db', 'password'],
		['Cookie: session=s%3AabcDEF123.sig', 'cookie'],
		['Set-Cookie: sid=abc123def456', 'cookie'],
		['Authorization: AbCdEfGhIjKl12345', 'authorization'],
		['Bearer AbCdEfGhIjKlMnOpQrSt', 'bearer'],
		['{\n  "password":\n    "hunter2"\n}', 'password'],
		['password:\n  hunter2', 'password'],
		['password: a hunter2', 'password'],
		['password: the hunter2 here', 'password'],
		['the secret: it fails2', 'secret'],
		['pwd: the cwd9', 'pwd'],
		// Trade-off: prose without a validation or status word refuses.
		['pwd: the cwd', 'pwd'],
		['sessionId: abc123', 'session'],
		['sid=abc123def456', 'sid'],
		['oauth_token: abc', 'auth'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toMatch(/hunter2|abc123/);
	});

	test.each([
		// Prose with a status word after a label passes (round 3 of #246).
		'the secret: it fails',
		'password: string',
		'Bearer tokens expire',
		'apiKey: process.env.KEY',
		'Error: password: required',
		'inside: 5, bypass: x, compass: north, author: Jane, authority: high',
		'password:\n  type: string',
		'"password": {\n  "x": 1\n}',
		'tokenTtl: 3600 and passwordMinLength: 8 and maxToken: 5',
		'Cookie: <redacted>',
		'mysql -u root -p',
		'ls -pla and tool --token',
		'Bearer authentication',
	])('%p passes', (text) => {
		expect(scrub(text, {}).secrets).toEqual([]);
	});
});

describe('scrub: quantity exemption is per whole word', () => {
	test.each([
		'ADMIN_PASSWORD=1234',
		'ACCOUNT_PASSWORD=4821',
		'MANAGER_TOKEN=9999',
		'adminToken=5555',
		'ADMIN_PASSWORD=20240101d',
		'tokenTtl: 1234567d',
		'DB_PASSWORD=Xk9$mP(2qL',
		'DB_PASSWORD="aB3$(xyz"',
		'MONGO_PASSWORD=Kq7.Zp2(',
		'REDIS_PASSWORD=abc$def(1',
		'password: (hunter2)',
		'password: getpass(hunter2',
	])('%p refuses', (text) => {
		expect(scrub(text, {}).refused).toBe(true);
	});

	test.each([
		'tokenTtl: 3600',
		'PASSWORD_MIN_LENGTH=8',
		'maxToken: 5',
		'sessionTimeout: 30m',
		'tokens: 3',
	])('%p passes', (text) => {
		expect(scrub(text, {}).refused).toBe(false);
	});
});

describe('scrub: more credential shapes', () => {
	test.each([
		['curl -u admin:hunter2 https://github.com/o/r', 'basic-auth'],
		['curl -s --user admin:hunter2 x', 'basic-auth'],
		['redis-cli -a hunter2', 'password'],
		["'password' => 'hunter2'", 'password'],
		[":password => 'hunter2'", 'password'],
		['passphrase=hunter2', 'passphrase'],
		['DB_PW=hunter2', 'pw'],
		['pw=hunter2', 'pw'],
		['password: wrong hunter2', 'password'],
		['password: missing, real one is hunter2', 'password'],
		['-----BEGIN PGP PRIVATE KEY BLOCK-----', 'private-key-block'],
		['password：hunter2', 'password'],
		['password&#61;hunter2', 'password'],
		['pass%77ord=hunter2', 'password'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toContain('hunter2');
	});

	test.each([
		['glpat-' + 'a1B2c3D4e5F6g7H8i9J0'],
		['xoxb-' + '123456789012-abcdefABCDEF'],
		['sk_live_' + 'a1B2c3D4e5F6g7H8'],
		['sk_test_' + 'a1B2c3D4e5F6g7H8'],
		['rk_live_' + 'a1B2c3D4e5F6g7H8'],
		['AIza' + 'SyA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q'],
		['ya29.' + 'a0AfH6SMBx1B2c3D4e5F6g7H8'],
		['SG.' + 'a1B2c3D4e5F6g7H8i9.J0k1L2m3N4o5P6q7R8'],
	])('provider token %p is replaced', (token) => {
		const result = transform(`see ${token} end`, cwd);
		expect(result.text).toBe('see <token> end');
		expect(result.changes).toContain('token');
	});

	test('wrong, required and the like still pass alone', () => {
		for (const text of [
			'password: wrong',
			'password: required;',
			'password: required',
		]) {
			expect(scrub(text, {}).secrets).toEqual([]);
		}
	});
});
