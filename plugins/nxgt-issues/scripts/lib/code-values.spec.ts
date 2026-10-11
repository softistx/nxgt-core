import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refuses = (text: string) => scrub(text, {}).refused;

describe('a literal inside a call is not code', () => {
	test.each([
		"const passwordHash = bcrypt.hash('Admin123!', 10)",
		"password: bcrypt.hash('Admin123!', 10)",
		"const auth = btoa('admin:hunter2')",
		"secret: Buffer.from('hunter2')",
		'const password = hash("hunter2")',
		"const secret = new TextEncoder().encode('jwt-secret')",
		'token: sign(payload, `s3cr3t`)',
		"apiKey: c.req.header('x-api-key', 'k3y!')",
		'password: P4ss(w0rd)',
		'secret: getSecret(s3cr3t)',
		"password: Buffer.from('hunter2').toString('base64')",
	])('%p refuses', (text) => {
		expect(refuses(text)).toBe(true);
	});

	test.each([
		'const token = await getToken(c)',
		'const session = await ory.toSession()',
		'password: z.string().min(8)',
		"apiKey: c.req.header('x-api-key')",
		"const token = c.req.header('Authorization')?.slice(7)",
		"secret: cookies.get('ory_kratos_session')",
		"const token = randomBytes(32).toString('base64url')",
		"const secret = createHash('sha256').update(input).digest('hex')",
		"const password = await prompt('password')",
		'token: sign(payload, key)',
	])('%p passes', (text) => {
		expect({ text, refused: refuses(text) }).toEqual({ text, refused: false });
	});
});

describe('a call is code only on the assignment path', () => {
	test.each([
		'Authorization: getToken()',
		'Authorization: Bearer getToken(c)',
		'Cookie: sid=readSid()',
		'curl -u admin:pass(word) x',
		'tool --password getpass()',
		'tool --token=read(x)',
	])('%p refuses', (text) => {
		expect(refuses(text)).toBe(true);
	});
});

describe('ordinary security code is not refused', () => {
	test.each([
		'session: Session | null',
		'session: Session',
		'token: Token',
		'token?: Token | undefined;',
		'cookie: Cookie[]',
		'sessions: Map<string, Session>',
		'const token: string = getToken();',
		'let secret: string | undefined = undefined;',
		'const secret = options.secret ?? defaultSecret',
		'secret: options.secret || process.env.SECRET',
		'const secret = process.env.JWT_SECRET!',
		"const secret = env['JWT_SECRET']",
		'const secret = process.env["JWT_SECRET"]!;',
		'const token = tokens[0]',
		'secret: secret,',
		'token: token;',
		'sessionTtl: 3600,',
		'tokenTtl: 900;',
		"cookie: 'sid'",
		"sessionCookie: 'ory_kratos_session',",
	])('%p passes', (text) => {
		const result = scrub(text, {});
		expect({ text, secrets: result.secrets }).toEqual({ text, secrets: [] });
	});

	test.each([
		'session: Hunter',
		'password: Session | hunter2',
		'const token: string = "hunter2";',
		'const secret = options.secret ?? "hunter2"',
		'const secret = options.secret ?? hunter2',
		'secret: other,',
		'token: tokens[0] + "x9"',
		"cookie: 'abc123'",
		"cookie: 's3cr3t!'",
		"session: 'sid'",
		'sessionTtl: 12345678,',
		"const secret = env['JWT_SECRET'] + 'x1'",
		'password: hunter[2]x',
		'Cookie: abc123def',
		"sessionCookie: 'abc123'",
	])('%p still refuses', (text) => {
		expect(refuses(text)).toBe(true);
	});
});
