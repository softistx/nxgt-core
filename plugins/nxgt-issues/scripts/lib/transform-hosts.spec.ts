import { describe, expect, test } from 'bun:test';
import { transform } from './scrub';

const cwd = '/Users/jane/work/secret-app';

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
