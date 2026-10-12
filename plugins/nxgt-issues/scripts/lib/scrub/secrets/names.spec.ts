import { describe, expect, test } from 'bun:test';
import {
	passes,
	passesUnrefused,
	refused,
	secretsOf,
} from './secrets.fixtures';

describe('key material in plain and env-style key names', () => {
	test.each([
		"const key = 'Zq8w-LmP3-vTnR'",
		'LICENSE_KEY=ABCD-EFGH-1234-5678',
		'ACCESS_KEY=AbCdEfGhIjKlMnOp',
		'STRIPE_KEY=rk_abcdefghijklmnop',
		'S3_ACCESS_KEY=minioadmin',
		"const accessKeyId = 'minioadmin'",
		"const clientKey = 'qwertyuiopasdf'",
		"licenseKey: 'ABCD-EFGH-IJKL-MNOP'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'REDIS_KEY_PREFIX=app:',
		'CACHE_KEY_TTL=60',
		'API_KEY=<your-key>',
		"sortKey: 'createdAt'",
		"storageKey: 'theme-v2'",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('array flags', () => {
	test.each([
		"spawn('mysql', ['-u', 'root', '-p', 'hunter2'])",
		"execa('redis-cli', ['-a', 'hunter2', 'ping'])",
		"spawn('redis-cli', ['-a', '123456'])",
		"spawn('mysql', ['-u','root','-p','1234'])",
		"spawn('mysql', ['-u','root','-p1234'])",
		"spawn('mysql', ['-u','root','-phunter2'])",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"spawn('docker', ['run', '-p', '8080:80', 'img'])",
		"spawn('ssh', ['-p', '2222', 'host'])",
		"spawn('find', ['.', '-print'])",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('encoders take ordinary text', () => {
	test.each([
		"Buffer.from('hello world')",
		"new TextEncoder().encode('hello')",
		"encode('hello')",
		"encode('hello world')",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});

	test.each([
		"Buffer.from('admin:hunter2')",
		"Buffer.from('hunter2')",
		"new TextEncoder().encode('jwt-secret')",
		"btoa('admin:hunter2')",
		"jwt.sign(p, Buffer.from('hello'))",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

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

describe('a spaced literal is a secret outside a message position', () => {
	test.each([
		"jwt.sign(p, 'This is my secret key 2024!')",
		"jwt.sign(payload, 'my secret')",
		"gatewaySecret('my gateway secret value')",
		"bcrypt.hash('correct horse battery staple', 10)",
		"createCipheriv('aes-256-gcm', 'my 32 byte key goes here now ok', iv)",
		"pbkdf2Sync(pw, 'my salt value', 1000, 32, 'sha256')",
		"expect(verifyPassword('correct horse', h)).toBe(true)",
		"setApiKey('k3y abc 123')",
		"bcrypt.compare('correct horse', hash)",
		"encode('my secret value')",
		"validateToken(token, 'Token has expired')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"verifyThing(signature, { description: 'Signature is invalid' })",
		"jwt.sign(p, key, { error: 'Could not sign it' })",
		"verifySignature(sig, { message: 'Bad signature here' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('role words, locales and env names are not keys', () => {
	test.each([
		"jwt.sign(p, 'admin')",
		"jwt.sign(p, 'abc')",
		"jwt.sign(p, 'DEV_SECRET')",
		"hashPassword('root')",
		"verifyPassword('admin', h)",
		"createHmac('sha256', 'refresh')",
		"login('alice', 'admin')",
		"login(page, 'admin', 'Admin123!')",
		"jwt.verify(token, 'user')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"login(page, 'admin')",
		"login('admin', password)",
		"compare(a, b, 'en')",
		"a.localeCompare(b, 'fr-CA', { sensitivity: 'base' })",
		"hash(input, 'sha3-256')",
		"createHmac('sha256', key)",
		"getSecret('JWT_SECRET')",
		"jwt.sign(payload, key, { algorithm: 'HS256', expiresIn: '1h' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

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
		'password: must be at least 8 characters',
		'password: cannot be empty',
		'password: does not match',
		'token: is invalid',
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
		'password: must change me',
		'password: wrong horse battery staple',
		'DB_PASSWORD: empty quiet river',
		'password: fails sometimes',
		"const secretError = 'hunter2'",
		'PasswordError: hunter2',
		'SessionException: abc123secretXYZ',
	])('%p refuses', (text) => {
		expect(secretsOf(text)).not.toEqual([]);
	});
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

describe('JSON that continues after a placeholder or an error message', () => {
	test.each([
		'{"sessionId":"<redacted>","path":"/auth/refresh"}',
		'{"error":"JsonWebTokenError: invalid signature","sessionId":"<redacted>"}',
		'{"error":"JsonWebTokenError: jwt expired","path":"/auth/refresh"}',
	])('%p passes', passes);

	test.each([
		'{"sessionId":"<redacted>","token":"k3J9xQ2mZp7vR4tL"}',
		'{"error":"JsonWebTokenError: invalid signature","password":"hunter2"}',
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
	])('%p passes', passesUnrefused);
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
	])('%p passes', passesUnrefused);

	test.each(["secretName: 'k3J9xQ2mZp7vR4tL'", 'password: must change me'])(
		'%p refuses',
		(text) => {
			expect(refused(text)).toBe(true);
		},
	);
});
