import { describe, expect, test } from 'bun:test';
import { passes, passesUnrefused, refused } from './secrets.fixtures';

describe('a typed parameter named like a credential', () => {
	test.each([
		'function f(token: string) {',
		'(token: string) => {',
		'async function findSession(token: string) {',
		'constructor(secret: string) {}',
		'constructor(private readonly secret: string) {}',
		'const fn = (password: string) => hash(password);',
		'export function verifyJwt(token: string, secret: string) {',
		'function f(secret: Buffer) {',
		'function f(secret: Uint8Array) {',
		'function f(secret: string | undefined) {',
		'function f(secret: KeyObject) {',
		'function f(key: CryptoKey, token?: string) {',
	])('%p passes', passes);

	test.each([
		'login(password: Swordfish)',
		'login(password: hunter2)',
		'f(token: k3J9xQ2mZp7vR4tL, x)',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('compound PascalCase types', () => {
	test.each([
		'function f(token: AccessToken) {',
		'function f(password: PasswordInput) {',
		'type Session = { token: SessionToken; }',
		'constructor(secret: ConfigService) {}',
		'function f(token: JwtPayload, other: number) {',
		'function f(token: AccessToken | undefined) {',
	])('%p passes', passes);

	// A single capitalised word is a value as likely as a type; known types
	// (Buffer, KeyObject…) and compound names (two or more humps) are the rule.
	test.each([
		'login(password: Swordfish)',
		'function f(token: Hunter2) {',
		'const o = { token: SessionToken }',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('a compound type needs a signature, not an assignment', () => {
	test.each([
		'helm install x --set auth.rootPassword=ChangeMe,auth.username=admin',
		'DbConfig(user=admin, password=ChangeMe, port=5432)',
		'Config(host=db, password=CorrectHorseBatteryStaple)',
		'export DB_PASSWORD=ChangeMe;',
		'DB_PASSWORD=CorrectHorse; psql',
		'environment: { POSTGRES_PASSWORD: ChangeMe, POSTGRES_DB: app }',
		'{ password: CorrectHorse, user: admin }',
		'password: MySecret, user: admin',
		'login(password: CorrectHorse)',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'(token: AccessToken)',
		'constructor(private readonly secret: ConfigService)',
		'type Session = { token: SessionToken; }',
		'interface Opts { password: PasswordInput; }',
		`constructor(\n  private readonly token: AccessToken,\n  private readonly other: UserService,\n) {}`,
		'const f = async (password: PasswordInput, user: User) => {}',
	])('%p passes', passes);
});

describe('class fields and declarations typed with a name', () => {
	test.each([
		`class AuthState {\n  token: AccessToken;\n}`,
		`class Signer {\n  private secret: SigningSecret;\n}`,
		`class Signer extends Base implements Keyed {\n  token?: SessionToken;\n}`,
		'let token: AccessToken;',
		'declare const token: AccessToken;',
	])('%p passes', passes);

	test.each([
		'class Box {\n  password: Hunter2024;\n}',
		'const o = {\n  token: SessionToken;\n}',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('GraphQL SDL types', () => {
	test.each([
		'  password: String!',
		'input LoginInput { email: String! password: String! }',
		'password: String! @deprecated',
		'type User { id: ID! apiKey: String token: String }',
		'input LoginInput {\n  email: String!\n  password: Password!\n}',
		'secret: [String!]!',
	])('%p passes', passesUnrefused);

	test.each(['password: Hunter2!', 'password: Opensesame', 'token: Abc123!'])(
		'%p refuses',
		(text) => {
			expect(refused(text)).toBe(true);
		},
	);
});

describe('SDL blocks and YAML sequences', () => {
	test.each([
		'type Env { GATEWAY_SECRET: K3J9xQ2mZp7vR4tL }',
		'type Env { secret: ABCDEFGH }',
		'passwords: [hunter2, swordfish]',
		'secret: [K3J9xQ2mZp7vR4tL]',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'type User { id: ID! }',
		'input X { file: Upload! }',
		'input LoginInput { password: Password! }',
		'roles: [admin, user]',
		'const cookieSecret = [process.env.COOKIE_SECRET]',
		'secrets: [oldSecret, newSecret]',
	])('%p passes', passes);
});
