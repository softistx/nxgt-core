import { describe, expect, test } from 'bun:test';
import { registrableDomain } from './deny-terms';
import { scrub, transform } from './scrub';

const t = (text: string) => transform(text, '/work/app').text;
const cwd = '/Users/jane/work/secret-app';

describe('bare domain names become <host>', () => {
	test.each([
		['open myeduapp.com in a browser', 'open <host> in a browser'],
		['admin.myeduapp.fr returns 502', '<host> returns 502'],
		['calls api.acme.io and cdn.acme.dev.', 'calls <host> and <host>.'],
		['shop.example-store.co.uk', '<host>'],
		['(see status.acme.cloud)', '(see <host>)'],
		['MyEduApp.Com', '<host>'],
		['host: acme.ai', 'host: <host>'],
		['grades.school.xyz, tests.school.tech', '<host>, <host>'],
	])('%p', (input, output) => {
		expect(t(input)).toBe(output);
	});

	test.each([
		'see github.com/o/r and npmjs.com',
		'registry.npmjs.org is up',
		'npmjs.org',
		'per nodejs.org and bun.sh',
		'developer.mozilla.org and mozilla.org',
		'use example.com or api.example.org',
		'index.ts and app.tsx and styles.css',
		'process.env.NODE_ENV',
		'Promise.all(tasks)',
		'this.app.get("/")',
		'return this.app;',
		'ctx.app and req.app',
		'socket.io',
		'node_modules/acme.io/index.js',
		'version 1.2.3',
		'user.me()',
	])('%p is left alone', (input) => {
		expect(t(input)).toBe(input);
	});
});

describe('bare domains next to a path, a prefix or a new TLD', () => {
	test.each([
		'POST api.myeduapp.com/graphql returns 500',
		'[docs](myeduapp.com/help)',
		'myeduapp.com/',
		"domain: '.myeduapp.com'",
		"origin: ['*.myeduapp.com']",
		'emails ending in @myeduapp.com',
		'app.myeduapp.ma',
		'myapp.it',
		'myapp.sh',
		'myapp.school',
		'portail.ecole.sn and site.lycee.tn',
		'campus.academy',
		'myeduapp.com?x=1 and myeduapp.com#top',
	])('%p loses the name', (input) => {
		expect(t(input)).not.toMatch(/myeduapp|myapp|ecole|lycee|campus/);
	});

	test('the path survives next to <host>', () => {
		expect(t('POST api.myeduapp.com/graphql returns 500')).toBe(
			'POST <host>/graphql returns 500',
		);
	});

	test('a Unicode label is rewritten whole', () => {
		expect(t('see école.fr')).toBe('see <host>');
	});

	test.each([
		'docs.github.com/en/rest',
		'gist.github.com',
		'nuxt.com, vitejs.dev, hono.dev, typescriptlang.org',
		'stackoverflow.com, mongodb.com, graphql.org, jsr.io, schema.org',
		'vuejs.org, react.dev, bun.sh, nodejs.org',
		'developer.mozilla.org/en-US/docs and npmjs.com/package/x',
		'built on ASP.NET and .NET 8',
		'node_modules/acme.io/index.js',
		'run deploy.sh then install.sh',
		'this.store and ctx.page',
		'process.env.NODE_ENV and index.ts',
	])('%p is left alone', (input) => {
		expect(t(input)).toBe(input);
	});

	test('the stats are not refused for a kept host', () => {
		expect(scrub('see docs.github.com', {}).refused).toBe(false);
	});
});

describe('more TLDs and private suffixes', () => {
	test.each([
		'school.acme.education',
		'acme.africa',
		'portal.acme.ng',
		'acme.co.ke',
		'acme.co.za',
		'acme.in',
		'acme.sa and acme.ae and acme.qa',
		'acme.studio, acme.agency, acme.digital, acme.space',
		'acme.live, acme.so, acme.to',
		'db.prod.acme.lan',
		'billing.acme.internal',
		'acme.local',
	])('%p loses the name', (input) => {
		expect(t(input)).not.toContain('acme');
	});

	test.each([
		'expect(x).to.equal(1)',
		'theme.space[2]',
		'chrome.storage.local.get(k)',
		'chrome.storage.local',
		'for (const k in obj)',
		'this.live',
	])('%p is left alone', (input) => {
		expect(t(input)).toBe(input);
	});
});

test('co.za is a second-level suffix', () => {
	expect(registrableDomain('portal.acme.co.za')).toBe('acme.co.za');
});

describe('transform: hosts', () => {
	test.each([
		['db.prod.internal.corp:5432', '<host>'],
		['connecting to 10.12.0.4:27017', 'connecting to <host>'],
		['mongo1.internal:27017', '<host>'],
		['ENOTFOUND mongo1.prod.billing.lan', 'ENOTFOUND <host>'],
		[
			'getaddrinfo ENOTFOUND mongo1.prod.billing.lan.',
			'getaddrinfo ENOTFOUND <host>.',
		],
		['getaddrinfo EAI_AGAIN db.corp', 'getaddrinfo EAI_AGAIN <host>'],
		['getaddrinfo db.corp', 'getaddrinfo <host>'],
		['peer 192.168.1.20 down', 'peer <host> down'],
		[
			'peer fe80::1 and ::1 and 2001:db8:0:0:0:0:0:1',
			'peer <host> and <host> and <host>',
		],
		['[::1]:8080', '<host>'],
	])('%p', (text, expected) => {
		expect(transform(text, cwd).text).toBe(expected);
	});

	test('code, versions, times and traces are not hosts', () => {
		for (const text of [
			'process.env and Promise.all',
			'at a.ts:12:5 and index.js:2000',
			'v1.2.3 and 1.2.3.999 at 12:30:45',
			'localhost:3000 and std::vector',
			'https://github.com/o/r and https://registry.npmjs.org/p',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
	});

	test('idempotent', () => {
		const once = transform('db.corp:5432 10.0.0.1 ENOTFOUND x.lan', cwd).text;
		expect(transform(once, cwd).text).toBe(once);
	});
});

describe('transform: single-label host:port', () => {
	test.each([
		['connect vexora-redis:6379', 'connect <host>'],
		['mongo1:27017 down', '<host> down'],
		['db-primary:5432', '<host>'],
	])('%p', (text, expected) => {
		expect(transform(text, cwd).text).toBe(expected);
	});

	test('a denied label, however plain', () => {
		expect(
			transform('at vexora:6379', cwd, (label) => label === 'vexora').text,
		).toBe('at <host>');
		expect(transform('at vexora:6379', cwd).text).toBe('at vexora:6379');
	});

	test('localhost, files, clocks and traces stay', () => {
		for (const text of [
			'localhost:3000',
			'a.ts:12',
			'at 12:30 and UTC-12:30',
			'schema.graphql:12 and x.proto:3 and a.sql:40',
			'err-at foo-bar:12:5',
			'key: 5000',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
	});
});
