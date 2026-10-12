import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BuiltNuxtApp, buildAndServe } from '../../test/nuxt-server';

/** A value of Nuxt's payload (devalue's flat array), read back from its index. */
function revive(payload: readonly unknown[], index: number): unknown {
	if (index === -1) return undefined;
	const value = payload[index];
	if (Array.isArray(value)) {
		// Nuxt's reducers: ['Reactive', i], ['Ref', i]… wrap the value at i.
		if (typeof value[0] === 'string') return revive(payload, value[1]);
		return value.map((item: number) => revive(payload, item));
	}
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				revive(payload, item as number),
			]),
		);
	}
	return value;
}

/** The value of `useState(key)` in a page's payload. */
function stateOf(html: string, key: string): unknown {
	const payload: unknown[] = JSON.parse(
		/<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/.exec(html)?.[1] ??
			'[]',
	);
	const state = payload.findIndex(
		(entry) =>
			typeof entry === 'object' && entry !== null && `$s${key}` in entry,
	);
	expect(state).toBeGreaterThanOrEqual(0);
	return (revive(payload, state) as Record<string, unknown>)[`$s${key}`];
}

/**
 * The module with `lazy: true`, as a consumer runs it: `nuxt build` on
 * `test/nuxt-lazy-app` (`en`, `fr`, `de`; `en` the fallback locale) from
 * `dist/` — so `bun run build` first — then requests on the server it
 * outputs. No browser: a switch in the browser is the loader's `import()` of
 * a chunk, so the spec checks the entry chunk names it and the server serves
 * it. About ten seconds.
 */
describe('a Nuxt app built with the module and lazy: true', () => {
	const app = join(import.meta.dir, '../../test/nuxt-lazy-app');
	const assets = join(app, '.output/public/_nuxt');
	let built: BuiltNuxtApp | undefined;
	let origin = '';

	beforeAll(async () => {
		built = await buildAndServe(app);
		origin = built.origin;
	}, 180_000);

	afterAll(() => {
		built?.stop();
	});

	const page = async (headers: Record<string, string>, path = '/') =>
		(await fetch(`${origin}${path}`, { headers })).text();
	/** The client chunks holding `text`, by file name. */
	const chunksWith = (text: string) =>
		readdirSync(assets).filter(
			(file) =>
				file.endsWith('.js') &&
				readFileSync(join(assets, file), 'utf8').includes(text),
		);

	test('builds without a warning from the module', () => {
		expect(built?.buildLog).not.toContain('WARN');
		expect(built?.buildLog).not.toContain('Could not resolve');
	});

	test('writes the types of t under .nuxt/, every locale included', () => {
		const types = readFileSync(
			join(built?.buildDir ?? app, 'types/nxgt-i18n-vue.d.ts'),
			'utf8',
		);
		expect(types).toContain("\t\t'extra.title': { };");
		expect(types).toContain("\t\t'de': true;");
	});

	test("renders on the server in the cookie's locale, loaded on demand", async () => {
		const html = await page({ 'accept-language': 'fr', cookie: 'language=de' });
		expect(html).toContain('<html  lang="de">');
		expect(html).toContain(
			'<h1>Willkommen</h1><p>Hallo Ada</p><p>Zusatz</p><p id="locale">de</p>',
		);
	});

	test('renders in the locale Accept-Language asks for, and in the fallback one', async () => {
		expect(await page({ 'accept-language': 'fr-CA,en;q=0.5' })).toContain(
			'<h1>Bienvenue</h1><p>Bonjour Ada</p><p>Supplément</p><p id="locale">fr</p>',
		);
		expect(await page({ 'accept-language': 'es' })).toContain(
			'<h1>Welcome</h1><p>Hello Ada</p><p>Extra</p><p id="locale">en</p>',
		);
	});

	test('puts the catalogue it rendered in in the payload, and null for the fallback locale', async () => {
		const de = await page({ cookie: 'language=de' });
		expect(stateOf(de, '@nxgt/i18n-vue:locale')).toBe('de');
		expect(stateOf(de, '@nxgt/i18n-vue:catalogue')).toEqual({
			home: { title: 'Willkommen', greeting: 'Hallo {name}' },
			extra: { title: 'Zusatz' },
		});
		const en = await page({ cookie: 'language=en' });
		expect(stateOf(en, '@nxgt/i18n-vue:catalogue')).toBeNull();
	});

	test('renders in, and remembers, a locale loaded on demand that setLocale chose on the server', async () => {
		const response = await fetch(`${origin}/?set=de`, {
			headers: { 'accept-language': 'en' },
		});
		expect(await response.text()).toContain('<h1>Willkommen</h1>');
		expect(response.headers.get('set-cookie')).toStartWith('language=de;');
		const guessed = await fetch(origin, {
			headers: { 'accept-language': 'fr' },
		});
		expect(guessed.headers.get('set-cookie')).toBeNull();
	});

	test('ships each other locale as a chunk of its own, absent from the entry chunk', async () => {
		const html = await page({ cookie: 'language=en' });
		const entry = /<script type="module" src="\/_nuxt\/([^"]+\.js)"/.exec(
			html,
		)?.[1];
		expect(entry).toBeDefined();
		const source = readFileSync(join(assets, entry ?? ''), 'utf8');
		expect(source).toContain('Welcome');
		for (const title of ['Bienvenue', 'Willkommen']) {
			const chunks = chunksWith(title);
			expect(chunks).toHaveLength(1);
			const [chunk = ''] = chunks;
			expect(chunk).not.toBe(entry);
			expect(source).not.toContain(title);
			// The loader's import() names the chunk, and the server serves it:
			// what a switch in the browser fetches.
			expect(source).toContain(chunk);
			const served = await fetch(`${origin}/_nuxt/${chunk}`);
			expect(served.status).toBe(200);
			expect(await served.text()).toContain(title);
		}
	});
});
