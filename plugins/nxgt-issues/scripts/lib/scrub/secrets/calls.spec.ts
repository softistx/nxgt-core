import { describe, expect, test } from 'bun:test';
import { scrub } from '../scrub';
import { passes, refused } from './secrets.fixtures';

describe('a compared literal whose other operand is a credential', () => {
	test.each([
		"basicAuth({ verifyUser: (username, password, c) => { return username === 'hono' && password === 'acoolproject' } })",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === 'swordfish' })",
		"{ verify: (u, p) => u === 'admin' && p === 'opensesame' }",
		"{ verify: (p) => p === 'my_secret_value' }",
		"{ verify: (input) => input.password === 'swordfish' }",
		"trustedGateway: (c) => c.req.header('x-gateway') === 'super_secret_gateway_key'",
		"{ verifyToken: (t) => 'swordfish' === t.token }",
		"const checkKey = (req) => req.apiKey === 'swordfish'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"{ verify: (method) => method === 'GET' }",
		"{ verifyRequest: (c) => c.req.header('content-type') === 'application/json' }",
		"{ verify: (s) => s.status === 'active' && s.kind !== 'refresh_token' }",
		"{ verify: (u, p) => u.role === 'admin' }",
		"basicAuth({ verifyUser: (u, p) => u === 'admin' && p === password })",
	])('%p passes', passes);
});

describe('scope and permission literals are not user:pass', () => {
	test.each([
		"export const checkScope = (claims) => claims.scope?.includes('read:users') ?? false",
		"const checkScopes = (c) => c.scopes.includes('write:org')",
		"const isAdmin = (c) => c.permissions.includes('admin:all')",
		"const checkRole = (c) => c.roles.includes('team:lead')",
		"const checkScope = (s) => s === 'read:users'",
		"const hasPermission = (c) => ['read:users', 'write:org'].includes(c.scope)",
	])('%p passes', passes);

	test.each([
		"const checkScope = (claims) => claims.scope?.includes('admin:Hunter2')",
		"const checkCaller = (c) => c.header === 'svc:k3J9xQ2mZp7vR4tL'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('credential headers, header lists and base64 encoders', () => {
	test.each([
		'curl -H "x-gateway-secret: $GATEWAY_SECRET" http://localhost:4000/graphql',
		"redact: ['authorization', 'cookie']",
		"const redact = ['authorization', 'x-api-key', 'set-cookie']",
	])('%p passes', passes);

	test.each([
		'curl -H "x-gateway-secret: k3J9xQ2mZp7vR4tL" http://localhost:4000/graphql',
		"'Basic ' + toBase64('admin:swordfish')",
		"'Basic ' + base64Encode('admin:swordfish')",
		"'Basic ' + b64('admin:swordfish')",
		"'Basic ' + encodeBase64('admin:swordfish')",
		"const auth = 'Basic ' + toBase64('admin:swordfish')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('credential comparisons outside a credential-named function', () => {
	test.each([
		"if (req.body.password === 'swordfish') {}",
		"if (password === 'acoolproject') {}",
		"if (c.req.header('x-api-key') !== 'acoolproject') {}",
		"if ('acoolproject' === password) {}",
		"if (headers.get('authorization') === 'acoolproject') {}",
		'authorize: (u, p) => p === "x"',
		"validate: (u, p) => p === 'hunter2x'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"if (method === 'GET') {}",
		"if (kind !== 'refresh_token') {}",
		"if (role === 'admin') {}",
		"if (status === 'active') {}",
		"if (e.key === 'Escape') {}",
		"if (input.type === 'password') {}",
		"if (authMode === 'oauth') {}",
		"if (c.req.header('content-type') === 'application/json') {}",
		'if (password === other) {}',
	])('%p passes', passes);
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

describe('the all-caps exemption is for lexer tokens only', () => {
	test.each(["if (lexer.token === 'EOF') {}", "if (tok.token === 'IDENT') {}"])(
		'%p passes',
		passes,
	);

	test.each([
		"if (c.req.header('x-api-key') !== 'SUPERSECRETKEY') {}",
		"if (apiKey === 'ABCDEFGHIJKLMNOP') {}",
		"if (process.env.ADMIN_TOKEN !== 'LETMEIN') {}",
		"if (password === 'SWORDFISH') {}",
		"if (token === 'SWORDFISH') {}",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('bracket reads and method calls keep a credential operand', () => {
	test.each([
		"if (req.headers['x-api-key'] === 'liveKey123abc') {}",
		'if (req.headers["authorization"] === "liveKey123abc") {}',
		"if (password.trim() === 'hunter2xyz') {}",
		"if (req.body.password?.trim() === 'hunter2xyz') {}",
		"if (c.req.header('x-api-key')?.trim() === 'liveKey123abc') {}",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"if (req.headers['content-type'] === 'application/json') {}",
		"if (name.trim() === 'admin') {}",
	])('%p passes', passes);
});

describe('method calls with arguments and the token exemption', () => {
	test.each([
		"if (req.headers.authorization.split(' ')[1] === 'devtoken') {}",
		"if (password.slice(0) === 'swordfish') {}",
		"if (body.password.slice(0, 64) === 'swordfish') {}",
		"if (config.apiToken === 'SWORDFISHSWORDFISH') {}",
		"if (req.query.token === 'LETMEIN') {}",
		"if (this.token === 'SWORDFISH') {}",
		"if (ctx.params.token === 'LETMEIN') {}",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"if (lexer.token === 'EOF') {}",
		"if (req.headers.authorization.split(' ')[0] !== 'Bearer') {}",
		"if (name.slice(0, 3) === 'adm') {}",
	])('%p passes', passes);
});

describe('a lone scheme word compared with authorization', () => {
	test.each([
		"if (authorization === 'Bearer') {}",
		"if (req.headers.authorization !== 'Basic') {}",
	])('%p passes', passes);

	test.each([
		"if (authorization === 'Bearer k3J9xQ2mZp7vR4tL') {}",
		"if (authorization == 'Basic YWRtaW46aHVudGVyMg==') {}",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('literal secrets in any credential call, at any depth', () => {
	test.each([
		"trustedGateway: gatewaySecret('super-secret-gateway-value')",
		"assertGatewaySecret(req, 'super-secret-gateway-value')",
		"headers.set('x-gateway-secret', 'super-secret-gateway-value')",
		"res.append('X-Auth-Token', 'abc')",
		"c.header('x-api-key', 'k3y')",
		"headers.set('Authorization', 'Basic YWRtaW46aHVudGVy')",
		"const jwtKey = new TextEncoder().encode('jwt-secret')",
		"await new SignJWT(p).sign(new TextEncoder().encode('jwt-secret'))",
		"btoa('admin:hunter2')",
		"Buffer.from('admin:Hunter2!')",
		"scrypt('Secret1', salt, 64)",
		"scryptSync('Secret1', salt, 64)",
		"pbkdf2Sync('hunter2', salt, 1000, 64, 'sha512')",
		"createCipheriv('aes-256-cbc', 'k3y-0123456789abcdef', iv)",
		"await crypto.subtle.importKey('raw', enc.encode('hunter2'), 'HMAC', false, ['sign'])",
		"createSecretKey(Buffer.from('my-32-byte-secret-key-123456789'))",
		"await argon2.hash(pw, { salt: Buffer.from('saltysalt') })",
		"hmac('sha256', 'webhook-secret')",
		"verifyPassword(user, 'Admin123!')",
		"comparePassword('Admin123!', h)",
		"expect(await hashPassword('Admin123!'))",
		"getToken('mysecret')",
		"c.cookies.set('sid', 'abc123')",
		"cookies.set('session', 's3cr3t')",
		"argon2.hash(pw, { salt: 'saltysalt', type: argon2id })",
		"jwt.sign(p, 'k', { audience: 'api' })",
		"await bcrypt.hash('Admin123!', 10)",
		"expect(await login('admin', 'Admin123!'))",
		"jwt.sign(payload, 'mysecret')",
		"createHmac('sha256', 'supersecretvalue')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"login(page, 'admin')",
		"login('admin', password)",
		"compare(a, b, 'en')",
		"a.localeCompare(b, 'fr-CA', { sensitivity: 'base' })",
		"verify(signature, { error: 'Signature is invalid' })",
		"hash(input, 'sha3-256')",
		"jwt.sign(payload, key, { algorithm: 'HS256', expiresIn: '1h' })",
		"createHash('sha256').update(input).digest('hex')",
		"createCipheriv('aes-256-gcm', key, iv)",
		"await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])",
		"Buffer.from(value, 'base64url')",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'btoa(`${user}:${pass}`)',
		"c.header('x-api-key')",
		"headers.set('Content-Type', 'application/json')",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"headers.set('Authorization', `Bearer ${token}`)",
		"signIn('magic-link', { email })",
		"setCookie(c, 'session-cookie', value)",
		'auth.api.signInEmail({ body: { email, password } })',
		'Object.keys(config)',
		"jwt.verify(token, '<secret>')",
		"login('admin', '****')",
		'encodeURIComponent(value)',
		"c.header('Set-Cookie', serialize('sid', value, { httpOnly: true }))",
		"verifyToken(token, { audience: 'api', issuer: 'janus' })",
		"getSecret('JWT_SECRET')",
		"cookies.set('sid', value, { httpOnly: true, sameSite: 'lax' })",
	])('%p passes', (text) => {
		const result = scrub(text, {});
		expect({ text, secrets: result.secrets }).toEqual({ text, secrets: [] });
	});
});

describe('an encoder assigned to a credential name', () => {
	test.each([
		"const secret = new TextEncoder().encode('opensesame')",
		"const JWT_SECRET = new TextEncoder().encode('opensesame')",
		"secret: new TextEncoder().encode('opensesame'),",
		"const secretKey = Buffer.from('opensesame', 'utf8')",
		"const hmacKey = Buffer.from('letmeinplease')",
		"const token = btoa('opensesame')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'const secret = new TextEncoder().encode(process.env.JWT_SECRET)',
		"const greeting = new TextEncoder().encode('hello there')",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('functions that compare a header to a literal secret', () => {
	test.each([
		"const isGateway = (c: Context) => c.req.header('x-gw') === 'k3J9xQ2mZp7vR4tL'",
		"const checkGateway = async (c) => { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' }",
		"const verifyCaller = function (c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' }",
		"{ trustedGateway(c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' } }",
		"{ async trustedGateway(c) { return c.req.header('x') === 'k3J9xQ2mZp7vR4tL' } }",
		"trustedGateway: (c) => constantTimeEqual(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => safeEqual(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => secureCompare(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => c.req.header('x')?.includes('k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => ['k3J9xQ2mZp7vR4tL'].includes(c.req.header('x'))",
		"trustedGateway: (c) => new Set(['k3J9xQ2mZp7vR4tL']).has(c.req.header('x'))",
		"trustedGateway: (c) => c.req.header('x')?.startsWith('k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => Object.is(c.req.header('x'), 'k3J9xQ2mZp7vR4tL')",
		"trustedGateway: (c) => 'k3J9xQ2mZp7vR4tL'.includes(c.req.header('x'))",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"const isGateway = (c: Context) => c.req.header('x-gw') === secret",
		"const getUser = (c) => c.req.header('x-user') === 'k3J9xQ2mZp7vR4tL'",
		"{ trustedGateway(c) { return c.req.header('x-gateway') === secret } }",
		"trustedGateway: (c) => ['GET', 'HEAD'].includes(c.req.method)",
		"trustedGateway: (c) => c.req.header('x')?.startsWith('Bearer')",
	])('%p passes', passes);
});

describe('verify keys compare ordinary values', () => {
	test.each([
		"{ verify: (method) => method === 'GET' || method === 'HEAD' }",
		"{ verifyRequest: (c) => c.req.header('content-type') === 'application/json' }",
		"{ verify: (s) => s.status === 'active' && s.kind !== 'refresh_token' }",
	])('%p passes', passes);

	test.each([
		"{ verify: (p) => p === 'changeme' }",
		"{ verify: (p) => p === 'Hunter2!' }",
		"{ verify: (p) => p === 'k3J9xQ2mZp7vR4tL' }",
		"{ verify: (p) => p === 'jwt-secret' }",
		"{ verify: () => 'GET' }",
		"{ verify: (h, cb) => cb(null, 'GET') }",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('spaced secrets in verify and compare calls', () => {
	test.each([
		"jwt.verify(token, 'my secret')",
		"jwtVerify(token, 'my secret')",
		"expect(verify(token, 'super secret key')).toBe(true)",
		"argon2.verify(hash, 'correct horse battery staple')",
		"verifyHmac(body, 'shared webhook secret')",
		"verifyWebhook(req, 'my webhook secret')",
		"verifySignature(payload, sig, 'whsec test secret')",
		"compare(input, 'correct horse battery')",
		"bcrypt.compareSync(input, 'open sesame please')",
		"validateSignature(body, 'mysecret')",
		// Accepted trade-off: prose in a verify call's positional argument refuses.
		"verify(signature, 'Signature is invalid')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"jwt.sign(p, key, { error: 'Could not sign it' })",
		"verifySignature(sig, { message: 'Bad signature here' })",
		"compare(a, b, 'en')",
		"jwt.sign(p, key, { jwtid: 'abc123', jti: 'r4nd0m' })",
	])('%p passes', (text) => {
		expect({ text, refused: refused(text) }).toEqual({ text, refused: false });
	});
});

describe('a function value is code, never a secret argument', () => {
	test('an arrow under an auth option passes', () => {
		passes(
			"oryAuth(ory, { trustedGateway: (c) => c.req.header('x-gateway') === secret })",
		);
	});

	test.each([
		"oryAuth(ory, { trustedGateway: function (c) { return c.req.header('x-gateway') === secret } })",
		"login(page, async () => { await page.fill('#email', 'a') })",
	])('%p passes', passes);

	test.each([
		"oryAuth(ory, { trustedGateway: 'literal-secret-123' })",
		"oryAuth(ory, { trustedGateway: (c) => check(c), secret: 'literal-secret-123' })",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});
