import { describe, expect, test } from 'bun:test';
import { scrub, transform } from './scrub';

const t = (text: string) => transform(text, '/work/app').text;

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
