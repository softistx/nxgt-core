import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const secretsOf = (text: string) => scrub(text, {}).secrets;

describe('literal secrets handed to an auth call', () => {
	test.each([
		"await bcrypt.hash('Admin123!', 10)",
		"const hashed = await bcrypt.hash('Admin123!', 10)",
		"bcrypt.hashSync('hunter', 10)",
		"await bcrypt.compare('Admin123!', user.hash)",
		"expect(await login('admin', 'Admin123!'))",
		"await signIn('jane', 'letmein')",
		"authenticate('admin', 'password')",
		"jwt.sign(payload, 'mysecret')",
		"jwt.verify(token, 'mysecret')",
		"createHmac('sha256', 'supersecretvalue')",
		"encrypt(data, 'my-key-1')",
		'decrypt(data, "k")',
		"const x = { digest: hash('hunter') }",
	])('%p refuses', (text) => {
		expect(secretsOf(text)).toContain('secret-argument');
	});

	test.each([
		"createHmac('sha256', key)",
		"createHash('sha256').update(input).digest('hex')",
		'await bcrypt.hash(password, 10)',
		'await bcrypt.compare(input, user.passwordHash)',
		"await login('admin', password)",
		"await login('admin', process.env.ADMIN_PASSWORD)",
		'jwt.sign(payload, secret, { expiresIn: 60 })',
		"jwt.verify(token, '<secret>')",
		'the hash (sha256) of the body',
		'sign in with your account',
		"login('admin', '****')",
	])('%p passes', (text) => {
		expect({ text, secrets: secretsOf(text) }).toEqual({ text, secrets: [] });
	});
});

describe('reader key names', () => {
	test.each([
		"apiKey: c.req.header('sk-live-AbCdEf')",
		"token: c.req.header('AbCdEf')",
		"token: headers.get('ghp-abcdef')",
		"secret: cookies.get('x9k2')",
	])('%p refuses', (text) => {
		expect(scrub(text, {}).refused).toBe(true);
	});

	test.each([
		"apiKey: c.req.header('x-api-key')",
		"apiKey: c.req.header('X-Api-Key')",
		"token: c.req.header('Authorization')",
		"secret: cookies.get('ory_kratos_session')",
		"secret: env.get('JWT_SECRET')",
	])('%p passes', (text) => {
		expect(scrub(text, {}).refused).toBe(false);
	});
});
