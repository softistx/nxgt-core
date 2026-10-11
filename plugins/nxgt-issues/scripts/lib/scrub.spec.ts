import { describe, expect, test } from 'bun:test';
import { buildDenyList, scrub } from './scrub';

const cwd = '/Users/jane/work/secret-app';

describe('scrub', () => {
	const denyList = buildDenyList({
		appRepo: 'jane/secret-app',
		cwd,
		gitName: 'Jane Doe',
		hostname: 'janes-mbp',
		privateRepos: ['jane/hidden-two'],
	});

	test('a clean report passes, transformed', () => {
		const result = scrub(`Fails at ${cwd}/src/a.ts:3 for jane@example.com`, {
			cwd,
			denyList,
		});
		expect(result.text).toBe('Fails at <app>/src/a.ts:3 for <email>');
		expect(result.changes).toEqual(['email', 'path']);
		expect(result.refused).toBe(false);
		expect(result.denied).toEqual([]);
		expect(result.secrets).toEqual([]);
	});

	test('a deny-list hit after the transforms refuses the filing', () => {
		const result = scrub('Our secret-app uses it with hidden-two', {
			cwd,
			denyList,
		});
		expect(result.refused).toBe(true);
		expect(result.denied).toEqual(
			expect.arrayContaining(['secret-app', 'hidden-two']),
		);
	});

	test('a name that only appeared inside a path is gone by verification', () => {
		const result = scrub(`${cwd}/src/a.ts`, { cwd, denyList });
		expect(result.refused).toBe(false);
	});

	test('a name outside the cwd path is caught', () => {
		const result = scrub('error in /srv/other/secret-app/x.ts', {
			cwd,
			denyList,
		});
		expect(result.text).toBe('error in <app>/…');
		expect(result.refused).toBe(false);
		expect(
			scrub('Jane Doe reported on janes-mbp', { cwd, denyList }).denied,
		).toEqual(['Jane Doe', 'Jane', 'Doe', 'janes-mbp']);
	});

	test('allow lets the reported package through', () => {
		const result = scrub('secret-app is the package', {
			denyList,
			allow: ['secret-app'],
		});
		expect(result.refused).toBe(false);
	});

	test('no deny-list means no refusal', () => {
		expect(scrub('anything', {}).refused).toBe(false);
	});
});

describe('scrub: ordinary filings with a realistic deny-list', () => {
	const list = buildDenyList({
		appRepo: 'softistx/vexora-api',
		appPackages: ['@alxia/web'],
		privateRepos: [
			'jane/secret-app',
			'quillon-federation',
			'quiet-gateway',
			'zorblax-ledger',
		],
	});

	test('private repositories are denied by name and by distinctive stem', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining(['secret-app', 'quillon-federation', 'zorblax']),
		);
		for (const stem of ['secret', 'nxgt', 'federation', 'quiet', 'gateway']) {
			expect(list.terms).not.toContain(stem);
		}
		expect(list.terms).toEqual(
			expect.arrayContaining(['alxia', '@alxia', 'vexora']),
		);
	});

	test.each([
		'`gatewaySecret(...)` throws when the secret is shorter than 16 characters',
		'the client secret is rejected by Hydra',
		'`assertGatewaySecret` compares in constant time',
		'JWT secret rotation breaks verify',
		'The federation gateway forwards X-User-Id',
		'const token = await getToken(c)',
		'const session = await ory.toSession()',
		'password: z.string().min(8)',
		'token: ctx.token',
		'secret: config.secret',
		"apiKey: c.req.header('x-api-key')",
		'Cookie: ory_kratos_session=<redacted>',
		'Set-Cookie: a=<redacted>; b=<redacted>',
	])('%p passes', (text) => {
		const result = scrub(text, {
			denyList: list,
			allow: ['@nxgt/shared-hono'],
		});
		expect({ text, denied: result.denied, secrets: result.secrets }).toEqual({
			text,
			denied: [],
			secrets: [],
		});
	});

	test('the app stem and the private names still refuse', () => {
		for (const text of [
			'vexora crashed',
			'secret-app crashed',
			'QuillonFederation',
		]) {
			expect(scrub(text, { denyList: list }).refused).toBe(true);
		}
	});

	test('real values still refuse', () => {
		for (const text of [
			'token: hunter2',
			'secret: abc.def1',
			'password: z.hunter2',
			'apiKey: sk-abc123',
			'Cookie: ory_kratos_session=abc123',
		]) {
			expect(scrub(text, {}).refused).toBe(true);
		}
	});
});
