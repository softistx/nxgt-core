import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectThrow } from '../../test/expect-throw';
import { checkModuleOptions, pluginSource } from './index';

describe('checkModuleOptions', () => {
	test('refuses a wiring mistake with a TypeError starting nxgtI18n:', () => {
		expectThrow(
			() => checkModuleOptions(undefined),
			TypeError,
			"nxgtI18n: options must be an object, as { locales: ['en', 'fr'] }",
		);
		expectThrow(
			() => checkModuleOptions({ locales: ['en'], cookie: 'a b' }),
			TypeError,
			"nxgtI18n: cookie must be a cookie name, as 'language'",
		);
		expect(() =>
			checkModuleOptions({ locales: ['en'], cookie: 'i18n_locale' }),
		).not.toThrow();
	});
});

describe('pluginSource', () => {
	const source = pluginSource({
		catalogues: { en: { a: "It's {name}" } },
		fallbackLocale: 'en',
		cookie: 'lang',
	});

	test('inlines the checked catalogues as JSON, and names the cookie', () => {
		expect(source).toContain('const catalogues = {"en":{"a":"It\'s {name}"}};');
		expect(source).toContain(
			`useCookie("lang", { path: '/', sameSite: 'lax', maxAge: 31536000 })`,
		);
		expect(source).toContain('useState("@nxgt/i18n-vue:locale")');
	});

	test('reads Accept-Language on the server and navigator.languages in the browser', () => {
		expect(source).toContain(
			"import.meta.server\n\t\t\t\t\t? useRequestHeaders(['accept-language'])['accept-language']",
		);
		expect(source).toContain('navigator.languages');
		expect(source).toContain('useHead({ htmlAttrs: { lang: i18n.locale } });');
	});
});

/**
 * The module as a consumer runs it: `nuxt build` on `test/nuxt-app`, which
 * installs `@nxgt/i18n-vue/nuxt` from `dist/` — so `bun run build` first —
 * then requests on the server it outputs. About ten seconds.
 */
describe('a Nuxt app built with the module', () => {
	const app = join(import.meta.dir, '../../test/nuxt-app');
	const nuxt = join(import.meta.dir, '../../node_modules/nuxt/bin/nuxt.mjs');
	let server: ReturnType<typeof Bun.spawn> | undefined;
	let origin = '';
	let buildLog = '';

	beforeAll(async () => {
		await Bun.$`bun run ${join(app, 'link.ts')}`.quiet();
		const build = await Bun.$`node ${nuxt} build`.cwd(app).quiet().nothrow();
		buildLog = `${build.stdout}${build.stderr}`;
		if (build.exitCode !== 0)
			throw new Error(`nuxt build failed:\n${buildLog}`);
		const port = 30_000 + Math.floor(Math.random() * 20_000);
		origin = `http://127.0.0.1:${port}`;
		server = Bun.spawn(['node', join(app, '.output/server/index.mjs')], {
			env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
			stdout: 'ignore',
			stderr: 'ignore',
		});
		for (let attempt = 0; attempt < 100; attempt++) {
			if (
				await fetch(origin).then(
					() => true,
					() => false,
				)
			)
				return;
			await Bun.sleep(100);
		}
		throw new Error('the built Nuxt server did not answer');
	}, 180_000);

	afterAll(() => {
		server?.kill();
	});

	const page = async (headers: Record<string, string>) =>
		(await fetch(origin, { headers })).text();

	test('builds without a warning from the module', () => {
		expect(buildLog).not.toContain('WARN');
		expect(buildLog).not.toContain('Could not resolve');
	});

	test('writes the types of t under .nuxt/, from the catalogues, folder layout included', () => {
		const types = join(
			app,
			'node_modules/.cache/nuxt/.nuxt/types/nxgt-i18n-vue.d.ts',
		);
		expect(existsSync(types)).toBe(true);
		const source = readFileSync(types, 'utf8');
		expect(source).toContain("\t\t'home.greeting': { name: string | number };");
		// locales/en/extra.json: the file's path is a key prefix.
		expect(source).toContain("\t\t'extra.title': { };");
	});

	test('renders on the server in the locale Accept-Language asks for', async () => {
		const html = await page({ 'accept-language': 'fr-CA,en;q=0.5' });
		expect(html).toContain('<html  lang="fr">');
		expect(html).toContain(
			'<main><h1>Bienvenue</h1><p>Bonjour Ada</p><p>2 articles</p><p id="locale">fr</p></main>',
		);
	});

	test('prefers the cookie to Accept-Language', async () => {
		const html = await page({
			'accept-language': 'fr',
			cookie: 'language=en',
		});
		expect(html).toContain('<html  lang="en">');
		expect(html).toContain('<h1>Welcome</h1><p>Hello Ada</p><p>2 items</p>');
	});

	test('answers the fallback locale when nothing matches', async () => {
		expect(await page({ 'accept-language': 'de' })).toContain(
			'<h1>Welcome</h1>',
		);
		expect(await page({ cookie: 'language=klingon' })).toContain(
			'<h1>Welcome</h1>',
		);
	});

	test('puts the locale in the payload, so the browser hydrates in it', async () => {
		const html = await page({ 'accept-language': 'fr' });
		const payload: unknown[] = JSON.parse(
			/<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/.exec(html)?.[1] ??
				'[]',
		);
		const state = payload.find(
			(entry): entry is Record<string, number> =>
				typeof entry === 'object' &&
				entry !== null &&
				'$s@nxgt/i18n-vue:locale' in entry,
		);
		expect(state).toBeDefined();
		expect(payload[state?.['$s@nxgt/i18n-vue:locale'] ?? -1]).toBe('fr');
	});

	test('renders in, and remembers, a locale chosen with setLocale on the server', async () => {
		const response = await fetch(`${origin}/?set=fr`, {
			headers: { 'accept-language': 'en' },
		});
		expect(await response.text()).toContain('<h1>Bienvenue</h1>');
		expect(response.headers.get('set-cookie')).toStartWith('language=fr;');
	});

	test('does not set the cookie for a locale it only guessed', async () => {
		const response = await fetch(origin, {
			headers: { 'accept-language': 'fr' },
		});
		expect(response.headers.get('set-cookie')).toBeNull();
	});
});
