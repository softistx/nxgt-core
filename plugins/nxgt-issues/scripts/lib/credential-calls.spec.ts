import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;

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
		"verify(signature, 'Signature is invalid')",
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
