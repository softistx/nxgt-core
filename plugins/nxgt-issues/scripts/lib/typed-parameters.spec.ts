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

describe('name:=default and name:?message expansions', () => {
	test.each([
		`: "\${DB_PASSWORD:=swordfish}"`,
		`: \${DB_PASSWORD:=swordfish}`,
		`echo \${DB_PASSWORD:=swordfish}`,
		`echo \${API_TOKEN:+swordfish1}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`JWT_SECRET: \${JWT_SECRET:?Set JWT_SECRET in .env}`,
		`\${JWT_SECRET:?must be set, see README.md}`,
		`\${JWT_SECRET:?JWT_SECRET is required}`,
		`echo \${DB_HOST:=localhost}`,
	])('%p passes', passes);
});

describe('requirepass flags are literals, the bare directive is read as prose or config', () => {
	test.each([
		'command: redis-server --requirepass Hunter2024 --appendonly yes',
		'command: redis-server --requirepass=Hunter2024 --appendonly yes',
		'redis-server --requirepass Hunter2024 --maxmemory 256mb',
		'redis-server --requirepass Hunter2024 --save ""',
		'command: redis-server --requirepass Hunter2024 --loglevel warning',
		'docker run -d redis redis-server --requirepass Hunter2024 --appendonly yes',
		'command: redis-server --requirepass Hunter2024 # dev only',
		'requirepass Hunter2024 # change me',
		'Set `requirepass Hunter2024` in redis.conf',
		'- requirepass Hunter2024',
		'1. requirepass Hunter2024',
		"sed 's|^# requirepass .*|requirepass Hunter2024|' redis.conf",
		"echo -e 'port 6379\\nrequirepass Hunter2024' > redis.conf",
		'requirepass: Hunter2024',
		'masterauth Hunter2024',
		'# requirepass Hunter2024',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'set requirepass in redis.conf',
		'the requirepass directive sets the password',
		'--requirepass $$REDIS_PASSWORD',
		'--requirepass "$REDIS_PASSWORD"',
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

describe("compose defaults are judged by the name's last word", () => {
	test.each([
		`DB_PASSWORD: \${DB_PASSWORD:-$POSTGRES_PASSWORD}`,
		`\${DB_PASSWORD:-\${POSTGRES_PASSWORD}}`,
		`\${DB_PASSWORD:-""}`,
		`\${GH_TOKEN:-<your token>}`,
		`\${TOKEN_TTL:-3600}`,
		`\${TOKEN_AUDIENCE:-my-app}`,
		`\${SECRET_NAME:-app-secrets}`,
		`\${JWT_SECRET_FILE:-/run/secrets/jwt}`,
		`\${PASSWORD_MIN_LENGTH:-12}`,
		`TOKEN_ISSUER: \${TOKEN_ISSUER:-auth-service}`,
	])('%p passes', passes);

	test.each([
		`\${DB_PASSWORD:-swordfish}`,
		`\${JWT_SECRET:-k3J9xQ2mZp7vR4tL}`,
		`\${API_KEY:-my-app}`,
		`\${DB_PASSWORD:-12345}`,
		`\${REDIS_PASSWORD:-123456}`,
		`\${PIN:-0000}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('compose names are judged by the credential keyword, not by their last word alone', () => {
	test.each([
		`PGPASSWORD=\${PGPASSWORD:-swordfish} psql -h db -U app`,
		`POSTGRES_PASSWORD: \${DB_PASSWORD_DEV:-swordfish}`,
		`password: \${DB_PASSWORD_VALUE:-swordfish}`,
		`password: \${APP_NAME:-swordfish}`,
		`\${ADMIN_PASSWORD_DEV:-swordfish}`,
		`\${OAUTH_CLIENT_SECRET_DEV:-swordfish}`,
		`\${JWT_SECRET_LOCAL:-swordfish}`,
		`\${PASSWORD_PROD:-swordfish}`,
		`\${ADMIN_PASSWORD2:-swordfish}`,
		`\${API_KEY_DEV:-abc123}`,
		`APP_KEY: \${APP_KEY:-base64:Zq8wLmP3vTnR}`,
		`\${SECRET_KEY_BASE:-swordfish}`,
		`X: \${AUTH_HEADER:-Basic YWRtaW46aHVudGVyMg==}`,
		`\${AWS_SECRET_ACCESS_KEY:-wJalrXUtnFEMI}`,
		`\${SASLAUTHD_PASSWORD:-swordfish}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`\${TOKEN_TTL:-3600}`,
		`\${PASSWORD_MIN_LENGTH:-12}`,
		`\${JWT_SECRET_FILE:-/run/secrets/jwt}`,
		`\${SECRET_NAME:-app-secrets}`,
		`\${TOKEN_AUDIENCE:-my-app}`,
		`\${PIN_LENGTH:-4}`,
		`\${OAUTH_API_HOSTNAME:-oauth-api.example.com}`,
		`\${OAUTH_CLIENT_ID:-my-app}`,
		`\${TOKEN_EXPIRES_IN:-1h}`,
		`\${SESSION_DRIVER:-redis}`,
		`\${SESSION_LIFETIME:-120}`,
		`\${AWS_ACCESS_KEY_ID:-AKIAEXAMPLE}`,
		`\${SASLAUTHD_MECHANISMS:-ldap}`,
		`\${AUTHENTICATED_USERS:-admin}`,
		`\${SESSION_STORE:-redis}`,
		`password: \${DB_PASSWORD:-$POSTGRES_PASSWORD}`,
		`password: \${DB_PASSWORD:-\${POSTGRES_PASSWORD}}`,
		`PGPASSWORD=\${PGPASSWORD:-$OTHER_PASSWORD} psql -h db`,
	])('%p passes', (text) => {
		passes(text);
	});
});

describe('redis directives after config set, in prose and in quotes', () => {
	test.each([
		'redis-cli CONFIG SET requirepass Hunter2024',
		'127.0.0.1:6379> CONFIG SET requirepass Hunter2024',
		'RUN echo "requirepass Hunter2024" >> /etc/redis/redis.conf',
		"printf 'requirepass Hunter2024\\n' > redis.conf",
		"sed -i 's/^# requirepass .*/requirepass Hunter2024/' redis.conf",
		'requirepass Hunter2024 # change me',
		'Set `requirepass Hunter2024` in redis.conf',
		'- requirepass Hunter2024',
		'1. requirepass Hunter2024',
		"sed 's|^# requirepass .*|requirepass Hunter2024|' redis.conf",
		"echo -e 'port 6379\\nrequirepass Hunter2024' > redis.conf",
		'requirepass: Hunter2024',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'requirepass is not set',
		'requirepass and masterauth must match',
		'requirepass should be long',
		'`requirepass` is set in redis.conf',
		'AUTHENTICATED: false',
	])('%p passes', passes);
});

describe('round 9: fused auth names, authkey flag, scheme defaults, vault ids', () => {
	test.each([
		'      - TS_AUTHKEY=Hunter2024',
		'export TAILSCALE_AUTHKEY="k3J9xQ2mPz7vL8wq"',
		'REDIS_MASTERAUTH=Hunter2024',
		'BASICAUTH=admin:Hunter2024',
		'const authkey = "k3J9xQ2mPz7vL8wq";',
		`\${REDIS_MASTERAUTH:-Hunter2024}`,
		`\${AUTHKEY:-k3J9xQ2mPz7vL}`,
		'tailscale up --authkey=Hunter2024',
		'tailscale up --login-server https://hs.example.com --authkey 8f3a1c9e2b7d4f6a0e5c3b1d',
		`X: \${AUTH_HEADER:-Basic YWRtaW46aHVudGVyMg==}`,
		`curl -H "Authorization: \${AUTH_HEADER:-Basic YWRtaW46aHVudGVyMg==}" https://x.example.com`,
		`\${SECRET_ID:-6a1f9c2e}`,
		`secret_id: \${VAULT_SECRET_ID:-6a1f9c2e-77b1-4c0e}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'SASLAUTHD_MECHANISMS=ldap',
		'AUTHENTICATED_USERS=admin',
		`\${TITLE:-Bearer authentication guide}`,
		`\${HINT:-Digest authentication required}`,
		`\${AUTH_HEADER:-Bearer xxxxxxxxxxxx}`,
		`\${AUTH_HEADER:-Basic YOUR_BASE64_HERE}`,
		`\${OAUTH_CLIENT_ID:-my-app}`,
		`\${SESSION_ID:-x}`,
		`\${AWS_ACCESS_KEY_ID:-AKIAEXAMPLE}`,
	])('%p passes', passes);
});

describe('round 10: short Basic credentials, header defaults, goauth', () => {
	test.each([
		`\${AUTH_HEADER:-Basic dXNlcjpwYXNz}`,
		`\${AUTH_HEADER:-Basic ZGVtbzpkZW1v}`,
		`\${AUTH_HEADER:-Basic YXBwOmhlbGxv}`,
		`Authorization: \${AUTH_HEADER:-Bearer swordfish}`,
		`curl -H "Authorization: \${AUTH_HEADER:-Bearer devtoken}" https://x.example.com`,
		'command: ["tailscale", "up", "--authkey", "Hunter2024"]',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`\${PLAN:-Basic subscription}`,
		`\${TIER:-Basic membership}`,
		`\${MSG:-Basic authentication}`,
		`\${X:-Basic YOUR_BASE64_HERE}`,
		`\${MSG:-Bearer credentials required}`,
		`Authorization: \${AUTH_HEADER}`,
		"GOAUTH='netrc'",
		'set GOAUTH=netrc',
		`\${GOAUTH:-netrc}`,
	])('%p passes', passes);
});

describe('round 11: scheme words under credential names, quoted header defaults', () => {
	test.each([
		`\${AUTH_HEADER:-Bearer swordfish}`,
		`AUTH_HEADER: \${AUTH_HEADER:-Bearer changeme}`,
		`- AUTH_HEADER=\${AUTH_HEADER:-Bearer devtoken}`,
		`API_AUTH_HEADER: "\${API_AUTH_HEADER:-Token supersecret}"`,
		`\${AUTH_HEADER:-Digest secretvalue}`,
		`Authorization: "\${AUTH_HEADER:-Bearer swordfish}"`,
		`Authorization: '\${AUTH_HEADER:-Bearer swordfish}'`,
		`headers: { Authorization: "\${AUTH_HEADER:-Bearer swordfish}" }`,
		`\${X:-Basic dXNlcjpwYXNzMQ}`,
		`\${AUTH_HEADER:-Basic admin:hunter2}`,
		`\${X:-Basic admin:hunter2}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`\${AUTH_HEADER:-Bearer xxxxxxxxxxxx}`,
		`\${AUTH_HEADER:-Bearer token}`,
		`\${AUTH_HEADER:-Basic YOUR_BASE64_HERE}`,
		`\${TITLE:-Bearer authentication guide}`,
		`\${HINT:-Digest authentication required}`,
		`\${PLAN:-Basic subscription}`,
		`\${TIER:-Basic membership}`,
		`\${MSG:-Basic authentication}`,
		`\${MSG:-Bearer swordfish}`,
	])('%p passes', passes);
});
