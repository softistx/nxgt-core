import { describe, expect, test } from 'bun:test';
import { scrub } from '../scrub';
import { findSecrets } from './secrets';
import { passes, refused } from './secrets.fixtures';

const USERPASS = 'dXNlcjpwYXNz'; // user:pass
const WORD = 'ZXhhbXBsZQ'; // example (no colon)

// biome-ignore-start lint/suspicious/noTemplateCurlyInString: compose defaults are written as plain strings
describe('a Basic scheme followed by a compose default', () => {
	test.each([
		`Authorization: Basic \${CREDS:-${USERPASS}}`,
		`curl -H "Authorization: Basic \${CREDS:-${USERPASS}}" https://x.example`,
		`headers: { Authorization: \`Basic \${CREDS:-${USERPASS}}\` }`,
		`Authorization: Basic \${CREDS:=${USERPASS}=}`,
		`Authorization: Basic \${CREDS:-\${OTHER:-${USERPASS}}}`,
	])('%p refuses', (text) => {
		expect(findSecrets(text)).toContain('authorization');
	});

	test.each([
		`Authorization: Basic \${CREDS:-${WORD}}`,
		'Authorization: Basic ${CREDS}',
		'Authorization: Basic ${CREDS:-}',
		'Authorization: Basic ${CREDS:-<base64>}',
		`headers: { Authorization: \`Basic \${CREDS:-${WORD}}\` }`,
	])('%p passes', (text) => {
		expect(findSecrets(text)).toEqual([]);
	});
});

describe('nested compose defaults', () => {
	test.each([
		'x ${A:-${B:-Bearer hunter2}}',
		'x ${A:-${B:-${C:-Basic hunter2}}}',
		'x ${A:=${B:-Token abc123}}',
		'x ${A:-${B:-bearer hunter2}}',
	])('%p refuses a short password after a scheme word', (text) => {
		expect(findSecrets(text)).toContain('authorization');
	});

	test.each([
		'x ${A:-${B:-}}',
		'x ${A:-${B:-Bearer <token>}}',
		'x ${A:-${B:-Bearer token}}',
		'x ${A:-${B:-3600}}',
	])('%p passes', (text) => {
		expect(findSecrets(text)).toEqual([]);
	});
});
// biome-ignore-end lint/suspicious/noTemplateCurlyInString: end of the compose defaults

describe('commands with a literal secret inside $(…) still hit the older rules', () => {
	test.each([
		'RESPONSE=$(curl -s -u admin:hunter2 https://api.example.com/v1/users)',
		`STATUS=$(curl -s -o /dev/null -w '%{http_code}' -u admin:swordfish https://x.example.com)`,
		'echo $(mysql -u root -phunter2 -e status)',
		'echo $(redis-cli -a hunter2 ping)',
		'x=$(docker login -u me --password hunter2 ghcr.io)',
		'echo $(mytool --password hunter2)',
		'x=$(echo -----BEGIN RSA PRIVATE KEY-----)',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('read-only commands are placeholders', () => {
	test.each([
		'JWT_SECRET=$(openssl rand -hex 32)',
		'SESSION_SECRET=$(openssl rand -base64 32)',
		'PASSWORD=$(pwgen 16 1)',
		'JWT_SECRET=$(cat secret.txt)',
		'TOKEN=$(curl -s https://example.com/token | jq -r .access_token)',
		'API_KEY=$(grep API_KEY .env | cut -d= -f2)',
		'KEY=$(vault kv get -field=access_key secret/minio)',
		'KEY=$(op read op://vault/db/password)',
		`SECRET=$(kubectl get secret minio -o jsonpath='{.data.secret}' | base64 -d)`,
		'GITHUB_TOKEN=$(gh auth token) bun run release',
		'TOKEN=$(gh auth token) gh api user',
		'PGPASSWORD=$(cat /run/secrets/db_password) psql -h db',
		'PGPASSWORD=$PGPASSWORD psql',
		'PASS=$(cat .pass | tr -d "\\n")',
	])('%p passes', passes);

	test.each([
		'PASSWORD=$(echo "hunter2")',
		"TOKEN=$(printf 'k3J9xQ2mZp7vR4tL')",
		'TOKEN=$(cat <<< k3J9xQ2mZp7vR4tL)',
		'TOKEN=$(echo 1234)',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('commands that take a secret positionally', () => {
	test.each([
		'PASSWORD=$(xargs echo swordfish)',
		'PASSWORD=$(env echo swordfish)',
		'PASSWORD=$(expr swordfish)',
		'PASSWORD=$(sudo echo swordfish)',
		'mongosh -u admin -p swordfish',
		'mongo --password swordfish',
		'ldapsearch -x -D cn=admin -w swordfish',
		'smbclient //host/share -U user%swordfish',
		'x=$(mongosh -p swordfish)',
		'HASH=$(htpasswd -nbB admin swordfish)',
		'echo $(caddy hash-password --plaintext swordfish)',
		'echo $(sshpass -p hunter2 ssh host)',
		'x=$(docker login -u me -p hunter2)',
		'openssl passwd -6 swordfish',
		'mkpasswd swordfish',
		'sshpass -p swordfish ssh host',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'HASH=$(htpasswd -nbB "$U" "$P")',
		'sshpass -p "$PASS" ssh host',
		'sshpass -f /run/secrets/ssh ssh host',
		'mongosh -u admin -p "$MONGO_PASSWORD"',
		'ldapsearch -x -W -D cn=admin',
		'smbclient //host/share -U "$SMB_USER%$SMB_PASS"',
		'T=$(sudo cat /run/secrets/token)',
		'mkpasswd -m sha-512 "$PASS"',
		'docker login -u me --password-stdin ghcr.io',
	])('%p passes', passes);
});

describe('pathological input', () => {
	const lines = (count: number, line: (i: number) => string) =>
		Array.from({ length: count }, (_, i) => line(i)).join('\n');
	const time = (text: string) => {
		const started = performance.now();
		scrub(text, {});
		return performance.now() - started;
	};

	test('a 90 KB text of unclosed substitutions scrubs in under 500 ms', () => {
		const text = lines(3000, (i) => `x${i}=$(echo "a ${i} unclosed`);
		expect(text.length).toBeGreaterThan(80_000);
		expect(time(text)).toBeLessThan(500);
	});

	test('a 140 KB text of comparisons scrubs in under 500 ms', () => {
		const text = lines(
			3000,
			(i) => `if (m${i} === 'GET' || kind === 'x${i}') {}`,
		);
		expect(time(text)).toBeLessThan(500);
	});
});

describe('a command substitution that holds a literal value', () => {
	test.each([
		'curl -H "Authorization: Basic $(echo -n admin:hunter2 | base64)" https://api.example.com/x',
		`curl -H "Authorization: Basic $(echo -n 'admin:Tr0ub4dor&3' | base64)" https://api.example.com/x`,
		'Authorization: Basic $(echo YWRtaW46aHVudGVyMg==)',
		'API_KEY=$(echo k3J9xQ2mZp7vR4tL)',
		'API_KEY="$(echo sk-live-k3J9xQ2mZp7vR4tLabcd)"',
		'password: $(echo Tr0ub4dor)',
		'const password = `$(echo Tr0ub4dor)`',
		`DATABASE_PASSWORD=$(printf 'Tr0ub4dor&3')`,
		'curl -H "X-Api-Key: $(printf k3J9xQ2mZp7vR4tL)" https://api.example.com/x',
		'secret: "$(k3J9xQ2mZp7vR4tL)"',
		'PASSWORD=$(echo hunter2)',
		'curl -u "$(echo admin):hunter2" https://api.example.com/x',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'PASSWORD=$(cat secret)',
		'PASSWORD=$(cat /run/secrets/db_password)',
		'curl -H "Authorization: Basic $(echo -n "$U:$P" | base64)" https://api.example.com/x',
		'TOKEN=$(gh auth token)',
		'API_KEY=$(cat ~/.config/zorblax/key)',
	])('%p passes', passes);
});

describe('shell variables as placeholders', () => {
	test.each([
		'password: "$UPERSECRET"',
		'curl -u "admin:$TOPSECRETWORD" https://api.example.com/x',
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" https://api.example.com/x',
		'curl -u "$USER:$PASS" https://api.example.com/x',
		'curl -u "$U:$P" https://api.example.com/x',
		'curl -u "$' +
			'{ADMINUSER}:$' +
			'{ADMINPASSWORD}" https://api.example.com/x',
	])('%p passes', passes);
});

describe('shell variables are placeholders', () => {
	test.each([
		'curl -u "$ADMIN_USER:$ADMIN_PASSWORD" https://api.example.com/x',
		'curl -u "$USER:$PASS" https://api.example.com/x',
		`curl -u \${USER}:\${PASS} https://api.example.com/x`,
		'curl -H "Authorization: Basic $(echo -n "$U:$P" | base64)" https://api.example.com/x',
		'curl -H "Authorization: Bearer $TOKEN" https://api.example.com/x',
	])('%p passes', passes);

	test.each([
		'curl -u admin:hunter2 https://api.example.com/x',
		'curl -u "admin:Hunter2!" https://api.example.com/x',
		'curl -u "$USER:Hunter2!" https://api.example.com/x',
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
		`\${OAUTH_API_HOSTNAME:-quillon-api.example.com}`,
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

describe('fused auth names, authkey flag, scheme defaults, vault ids', () => {
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
