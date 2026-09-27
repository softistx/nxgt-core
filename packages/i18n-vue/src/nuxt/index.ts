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
	addTypeTemplate,
	defineNuxtModule,
} from '@nuxt/kit';
import type { NuxtModule } from 'nuxt/schema';
import {
	type CatalogueSource,
	checkCatalogueSource,
	loadCatalogues,
} from '../node/load';
import { typesSource } from '../node/types-source';
import { pluginSource } from './plugin-source';

export {
	type PluginSourceOptions,
	pluginSource,
	STATE_KEY,
} from './plugin-source';

/** The module's options, under `nxgtI18n` in `nuxt.config.ts`. */
export interface ModuleOptions extends CatalogueSource {
	/** The cookie that stores a chosen locale. Default `'language'`, as `@nxgt/i18n`'s `LANGUAGE_KEY`. */
	readonly cookie?: string;
}

/** The name of the generated declaration file, under `.nuxt/`. */
export const TYPES_TEMPLATE = 'types/nxgt-i18n-vue.d.ts';

/** The name of the generated plugin, under `.nuxt/`. */
export const PLUGIN_TEMPLATE = 'nxgt-i18n-vue/plugin.mjs';

const COOKIE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/** Refuses options that cannot be right, with a `TypeError` starting `nxgtI18n:`. */
export function checkModuleOptions(
	options: unknown,
): asserts options is ModuleOptions {
	checkCatalogueSource('nxgtI18n', options);
	const { cookie } = options as ModuleOptions;
	if (
		cookie !== undefined &&
		(typeof cookie !== 'string' || !COOKIE.test(cookie))
	) {
		throw new TypeError(
			"nxgtI18n: cookie must be a cookie name, as 'language'",
		);
	}
}

/**
 * The module: it checks the project's resources — `locales/<locale>.json`
 * and `locales/<locale>/**\/*.json`, or `messages` — when Nuxt starts, adds a
 * plugin that installs `createI18n` with the locale resolved **on the
 * server** — the cookie, then `Accept-Language`, then the fallback locale —
 * and hydrated from the payload, writes `.nuxt/types/nxgt-i18n-vue.d.ts` so
 * `t('…')` is typed in every template, and auto-imports `useI18n`.
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
		// the folder itself so a new one restarts it too. `messages` gives only
		// its own file: see docs/guide/catalogues.md#splitting-catalogues.
		nuxt.options.watch.push(...loaded.files, ...loaded.folders);

		addPluginTemplate({
			filename: PLUGIN_TEMPLATE,
			getContents: () =>
				pluginSource({
					catalogues: loaded.catalogues,
					fallbackLocale: loaded.fallbackLocale,
					cookie: options.cookie ?? 'language',
				}),
		});
		addTypeTemplate({
			filename: TYPES_TEMPLATE,
			getContents: () =>
				typesSource(loaded.reference, loaded.fallbackLocale, {
					locales: loaded.locales,
					generator: '@nxgt/i18n-vue/nuxt',
				}),
		});
		addImports({ name: 'useI18n', from: '@nxgt/i18n-vue' });
	},
});

export default module;
