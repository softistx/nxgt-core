import { describe, expect, test } from 'bun:test';
import { transform } from './scrub';

const t = (text: string) => transform(text, '/work/app').text;

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
