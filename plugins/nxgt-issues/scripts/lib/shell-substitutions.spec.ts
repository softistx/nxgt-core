import { describe, expect, test } from 'bun:test';
import { scrub } from './scrub';

const refused = (text: string) => scrub(text, {}).refused;
const passes = (text: string) =>
	expect({ text, secrets: scrub(text, {}).secrets }).toEqual({
		text,
		secrets: [],
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
