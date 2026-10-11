import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

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

describe('compose defaults and redis variables', () => {
	test.each([
		`REDIS_PASSWORD: \${REDIS_PASSWORD:-}`,
		`JWT_SECRET: \${JWT_SECRET:?required}`,
		`JWT_SECRET: \${JWT_SECRET:?must be set}`,
		'redis-cli -a "$REDIS_PASSWORD" ping',
		'redis-cli -a $REDIS_PASSWORD',
		'PGPASSWORD="$PGPASSWORD" psql',
	])('%p passes', passes);

	test.each([
		`JWT_SECRET: \${JWT_SECRET:-hunter2}`,
		'redis-cli -a hunter2 ping',
		'{ token: hashed }',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('a compose default is a placeholder only when it is empty or an error message', () => {
	// `${POSTGRES_PASSWORD:-postgres}` refuses too: a default after `-`, `=` or `+`
	// is a literal password, and the accepted cost is the well-known dev default.
	test.each([
		`command: redis-server --requirepass \${REDIS_PASSWORD:-Hunter2024!}`,
		`command: ["redis-server", "--requirepass", "\${REDIS_PASSWORD:-Hunter2024!}"]`,
		`echo \${DB_PASSWORD:-Hunter2024!}`,
		`echo \${PASSWORD=Hunter2024!}`,
		`DB_PASSWORD: \${DB_PASSWORD:-correct horse battery}`,
		`\${DB_PASSWORD:-swordfish}`,
		`- DB_PASSWORD=\${DB_PASSWORD:-swordfish}`,
		`\${POSTGRES_PASSWORD:-postgres}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`REDIS_PASSWORD: \${REDIS_PASSWORD:-}`,
		`JWT_SECRET: \${JWT_SECRET:?required}`,
		`- DB_PASSWORD=\${DB_PASSWORD:?set it}`,
	])('%p passes', passes);
});

describe('requirepass', () => {
	test.each([
		'redis-server --requirepass hunter2',
		'requirepass Hunter2024!',
		'redis-server --requirepass=hunter2',
		'command: ["redis-server", "--requirepass", "hunter2"]',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'redis-server --requirepass "$REDIS_PASSWORD"',
		`requirepass \${REDIS_PASSWORD}`,
	])('%p passes', passes);
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
