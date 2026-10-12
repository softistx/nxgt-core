import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { expectThrow } from '../../test/expect-throw';
import { loadCatalogues } from '../node/load';
import { typesSource } from '../node/types-source';
import { checkModuleOptions } from './options';
import { pluginSource } from './plugin-source';
import { moduleTemplates, PLUGIN_TEMPLATE, TYPES_TEMPLATE } from './templates';

const fixture = (name: string) => join(import.meta.dir, '../../test', name);
const eager = await loadCatalogues(fixture('nuxt-app'), {
	locales: ['en', 'fr'],
});
const lazy = await loadCatalogues(fixture('nuxt-lazy-app'), {
	locales: ['en', 'fr', 'de'],
});

describe('moduleTemplates without lazy (characterization)', () => {
	for (const options of [{}, { lazy: false }, { cookie: 'lang' }]) {
		test(`adds the plugin and the types as before lazy existed: ${JSON.stringify(options)}`, () => {
			const templates = moduleTemplates(eager, options);
			expect(templates.plugin.filename).toBe(PLUGIN_TEMPLATE);
			expect(templates.plugin.getContents()).toBe(
				pluginSource({
					catalogues: eager.catalogues,
					fallbackLocale: 'en',
					cookie: 'cookie' in options ? options.cookie : 'language',
				}),
			);
			expect(templates.types.filename).toBe(TYPES_TEMPLATE);
			expect(templates.types.getContents()).toBe(
				typesSource(eager.reference, 'en', {
					locales: ['en', 'fr'],
					generator: '@nxgt/i18n-vue/nuxt',
				}),
			);
			expect(templates.locales).toEqual([]);
		});
	}
});

describe('moduleTemplates with lazy: true', () => {
	const templates = moduleTemplates(lazy, { lazy: true });
	const plugin = templates.plugin.getContents();

	test('writes one module per locale but the fallback one, of its merged catalogue', () => {
		expect(templates.locales.map((one) => one.filename)).toEqual([
			'nxgt-i18n-vue/locales/fr.mjs',
			'nxgt-i18n-vue/locales/de.mjs',
		]);
		const fr = templates.locales[0]?.getContents() ?? '';
		expect(fr).toStartWith('export default {');
		expect(fr).toEndWith('};\n');
		expect(JSON.parse(fr.slice('export default '.length, -2))).toEqual({
			home: { title: 'Bienvenue', greeting: 'Bonjour {name}' },
			extra: { title: 'Supplément' },
		});
	});

	test('inlines the fallback catalogue alone, and imports each other locale from #build/', () => {
		expect(plugin).toContain(
			`const catalogues = {"en":${JSON.stringify(lazy.catalogues['en'])}};`,
		);
		expect(plugin).not.toContain('Bienvenue');
		expect(plugin).not.toContain('Willkommen');
		expect(plugin).toContain(
			'const loaders = {\n' +
				'\t"fr": () => import("#build/nxgt-i18n-vue/locales/fr.mjs"),\n' +
				'\t"de": () => import("#build/nxgt-i18n-vue/locales/de.mjs"),\n' +
				'};',
		);
		expect(plugin).toContain('const locales = ["en","fr","de"];');
	});

	test('writes the same types as without lazy', () => {
		expect(templates.types.getContents()).toBe(
			moduleTemplates(lazy, {}).types.getContents(),
		);
	});

	test('with one locale, writes no module and a plugin with no loader', () => {
		const one = moduleTemplates({ ...lazy, locales: ['en'] }, { lazy: true });
		expect(one.locales).toEqual([]);
		expect(one.plugin.getContents()).toContain('const loaders = {\n};');
	});
});

describe('checkModuleOptions: lazy', () => {
	test('takes true or false, and refuses anything else with a TypeError', () => {
		for (const ok of [true, false, undefined]) {
			expect(() =>
				checkModuleOptions({ locales: ['en', 'fr'], lazy: ok }),
			).not.toThrow();
		}
		for (const bad of ['yes', 1, ['fr'], null]) {
			expectThrow(
				() => checkModuleOptions({ locales: ['en', 'fr'], lazy: bad }),
				TypeError,
				"nxgtI18n: lazy must be true or false, as { locales: ['en', 'fr'], lazy: true }",
			);
		}
	});
});
