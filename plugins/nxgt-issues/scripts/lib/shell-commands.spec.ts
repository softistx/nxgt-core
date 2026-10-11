import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
	});

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
