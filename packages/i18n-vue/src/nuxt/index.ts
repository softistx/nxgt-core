/**
 * `@nxgt/i18n-vue/nuxt` — the Nuxt module.
 *
 * ```ts
 * // nuxt.config.ts
 * export default defineNuxtConfig({
 *   modules: ['@nxgt/i18n-vue/nuxt'],
 *   nxgtI18n: { locales: ['en', 'fr'] },
 * });
 * ```
 */

import {
	addImports,
	addPluginTemplate,
	addTemplate,
	addTypeTemplate,
	defineNuxtModule,
} from '@nuxt/kit';
import type { NuxtModule } from 'nuxt/schema';
import { loadCatalogues } from '../node/load';
import { skipLocalePrefetch } from './manifest';
import { checkModuleOptions, type ModuleOptions } from './options';
import { moduleTemplates } from './templates';

export { checkModuleOptions, type ModuleOptions } from './options';
export {
	type PluginSourceOptions,
	pluginSource,
	STATE_KEY,
} from './plugin-source';
export { PLUGIN_TEMPLATE, TYPES_TEMPLATE } from './templates';

/**
 * The module: it checks the project's resources — `locales/<locale>.json`
 * and `locales/<locale>/**\/*.json`, or `messages` — when Nuxt starts, adds a
 * plugin that installs `createI18n` with the locale resolved **on the
 * server** — the cookie, then `Accept-Language`, then the fallback locale —
 * and hydrated from the payload, writes `.nuxt/types/nxgt-i18n-vue.d.ts` so
 * `t('…')` is typed in every template, and auto-imports `useI18n`. With
 * `lazy: true`, every locale but the fallback one is a module of its own,
 * `.nuxt/nxgt-i18n-vue/locales/<locale>.mjs`, which the plugin loads on
 * demand with `setupLazyNuxtI18n`.
 *
 * A catalogue that cannot be right **fails** `nuxt dev`, `nuxt build` and
 * `nuxt prepare`, naming the locale and the key.
 */
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
	meta: {
		name: '@nxgt/i18n-vue',
		configKey: 'nxgtI18n',
		compatibility: { nuxt: '>=4.0.0' },
	},
	async setup(options, nuxt) {
		checkModuleOptions(options);
		const root = nuxt.options.rootDir;
		const loaded = await loadCatalogues(root, options);

		// One copy of the package in the app, so `useI18n` injects what the
		// plugin provided.
		nuxt.options.build.transpile.push('@nxgt/i18n-vue');
		// The catalogues are read when the module runs: a change restarts it —
		// every file read (a folder's included, not only `<locale>.json`), and
		// the folder itself so a new one restarts it too — which writes every
		// template again, the locale modules of `lazy` included. `messages`
		// gives only its own file: see docs/guide/catalogues.md#splitting-catalogues.
		nuxt.options.watch.push(...loaded.files, ...loaded.folders);

		const templates = moduleTemplates(loaded, options);
		for (const locale of templates.locales) addTemplate(locale);
		if (templates.lazyLocales.length > 0) {
			// Nuxt prefetches every dynamic import: not the locales of `lazy`.
			nuxt.hook('build:manifest', (manifest) =>
				skipLocalePrefetch(manifest, templates.lazyLocales),
			);
		}
		addPluginTemplate(templates.plugin);
		addTypeTemplate(templates.types);
		addImports({ name: 'useI18n', from: '@nxgt/i18n-vue' });
	},
});

export default module;
