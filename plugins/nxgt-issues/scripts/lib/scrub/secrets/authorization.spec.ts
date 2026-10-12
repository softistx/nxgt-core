import { describe, expect, test } from 'bun:test';
import { passes, passesUnrefused, refused } from './secrets.fixtures';

describe('Authorization with a template or concatenated value', () => {
	test.each([
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'{ headers: { Authorization: `Bearer ${token}` } }',
		"Authorization: 'Bearer ' + token",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		'Authorization: `Basic ${btoa(`${u}:${p}`)}`',
	])('%p passes', passesUnrefused);

	test.each([
		'Authorization: Bearer abc123def456ghi',
		'Authorization: `Bearer abc123def456ghi`',
		"Authorization: 'Basic YWRtaW46aHVudGVy'",
		"Authorization: 'Bearer abc123def456ghi' + suffix",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('literals concatenated to or inside a scheme', () => {
	test.each([
		"Authorization: 'Bearer ' + 'k3J9xQ2mZp7vR4tL'",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"Authorization: `Bearer ${'k3J9xQ2mZp7vR4tL'}`",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Basic ${'YWRtaW46aHVudGVyMg=='}`",
		"'Bearer ' + token + 'k3J9xQ2mZp7vR4tL'",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		"Authorization: 'Bearer ' + token",
		"'Basic ' + btoa(user + ':' + pass)",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Bearer ${tokens['access']}`",
		"'Bearer ' + localStorage.getItem('token')",
		"'Bearer ' + c.get('token')",
		"'Bearer ' + session.get('accessToken')",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Bearer ${localStorage.getItem('token')}`",
		// biome-ignore lint/suspicious/noTemplateCurlyInString: source text under test
		"`Basic ${Buffer.from('admin:' + pw).toString('base64')}`",
		"'Bearer ' + token + '\\n'",
		"Authorization: 'Bearer ' + c.get('token')",
	])('%p passes', passes);
});

describe('reading a bearer token from a request', () => {
	test.each([
		"const token = c.req.header('authorization')?.replace('Bearer ', '')",
		"const token = c.req.header('authorization')?.replace(/^Bearer /, '')",
		"const token = c.req.header('authorization')?.slice(7)",
		"const token = c.req.header('authorization')?.split(' ')[1]",
		'const token = req.headers.authorization?.replace(/^Bearer /, "")',
	])('%p passes', passes);

	test.each([
		"const token = c.req.header('authorization')?.replace('Bearer ', 'k3J9xQ2mZp7vR4tL')",
		"const token = cleanup('Bearer ', 'k3J9xQ2mZp7vR4tL')",
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});
});

describe('short Basic credentials, header defaults, goauth', () => {
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

describe('scheme words under credential names, quoted header defaults', () => {
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

describe('header names without auth, filler with digits, placeholder words', () => {
	test.each([
		`\${AUTHORIZATION_HEADER:-Bearer swordfish}`,
		`API_AUTHORIZATION: \${API_AUTHORIZATION:-Bearer devtoken}`,
		`- PROXY_AUTHORIZATION=\${PROXY_AUTHORIZATION:-Basic supersecret}`,
		`HTTP_AUTHORIZATION: "\${HTTP_AUTHORIZATION:-Token changeme}"`,
		`\${AUTHZ_HEADER:-Bearer swordfish}`,
		`\${UPSTREAM_HEADER:-Bearer swordfish}`,
		`\${AUTHORIZATION:=Bearer swordfish}`,
		`\${AUTHORIZATION-Bearer swordfish}`,
		`\${AUTH_HEADER:-Token SK_LIVE_ABC123XYZ}`,
		`\${AUTH_HEADER:-Digest YourSecretKey2024}`,
		`\${AUTH_HEADER:-Bearer changeme}`,
		'Bearer YOUR_TOKEN_2',
		'Bearer YOUR_K3J9XQ2MP7VL',
		`\${MSG:-Token your_k3J9xQ2mP7vL}`,
		`\${MSG:-Token ABC123_DEF456}`,
	])('%p refuses', (text) => {
		expect(refused(text)).toBe(true);
	});

	test.each([
		`\${AUTH_HEADER:-Bearer YOUR_TOKEN}`,
		`\${AUTH_HEADER:-Basic YOUR_BASE64_HERE}`,
		`\${AUTH_HEADER:-Bearer redacted}`,
		`\${AUTH_HEADER:-Bearer placeholder}`,
		`\${AUTH_HEADER:-Bearer REDACTED}`,
		'Set the header to Bearer YOUR_TOKEN',
		`\${MSG:-Basic YOUR_BASE64_HERE}`,
	])('%p passes', passes);
});
