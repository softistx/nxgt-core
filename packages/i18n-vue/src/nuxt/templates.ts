import { catalogueModuleSource } from '../node/catalogue-module';
import type { LoadedCatalogues } from '../node/load';
import { typesSource } from '../node/types-source';
import type { ModuleOptions } from './options';
import { pluginSource } from './plugin-source';

/** The name of the generated declaration file, under `.nuxt/`. */
export const TYPES_TEMPLATE = 'types/nxgt-i18n-vue.d.ts';

/** The name of the generated plugin, under `.nuxt/`. */
export const PLUGIN_TEMPLATE = 'nxgt-i18n-vue/plugin.mjs';

/** The name of a locale's catalogue module under `.nuxt/`, with `lazy: true`: `nxgt-i18n-vue/locales/fr.mjs`. */
export const localeTemplate = (locale: string): string =>
	`nxgt-i18n-vue/locales/${locale}.mjs`;

/** A template the module adds, as Nuxt's `add*Template` take it. */
export interface ModuleTemplate<Filename extends string = string> {
	readonly filename: Filename;
	readonly getContents: () => string;
}

/** Every template the module adds, from the catalogues it loaded. */
export interface ModuleTemplates {
	readonly plugin: ModuleTemplate;
	readonly types: ModuleTemplate<typeof TYPES_TEMPLATE>;
	/** With `lazy: true`, one catalogue module per locale but the fallback one; else none. */
	readonly locales: readonly ModuleTemplate[];
}

/**
 * The module's templates. Without `lazy`, the plugin inlines every catalogue,
 * byte for byte as before `lazy` existed, and there is no locale module. With
 * `lazy: true`, each locale but the fallback one is a module of its own — its
 * merged catalogue, `catalogueModuleSource`'s, as the Vite plugin serves it —
 * and the plugin imports it on demand through `#build/`.
 */
export function moduleTemplates(
	loaded: LoadedCatalogues,
	options: Pick<ModuleOptions, 'cookie' | 'lazy'>,
): ModuleTemplates {
	const { catalogues, fallbackLocale } = loaded;
	const cookie = options.cookie ?? 'language';
	const lazy =
		options.lazy === true
			? loaded.locales.filter((locale) => locale !== fallbackLocale)
			: [];
	const types: ModuleTemplate<typeof TYPES_TEMPLATE> = {
		filename: TYPES_TEMPLATE,
		getContents: () =>
			typesSource(loaded.reference, fallbackLocale, {
				locales: loaded.locales,
				generator: '@nxgt/i18n-vue/nuxt',
			}),
	};
	if (options.lazy !== true) {
		return {
			plugin: {
				filename: PLUGIN_TEMPLATE,
				getContents: () => pluginSource({ catalogues, fallbackLocale, cookie }),
			},
			types,
			locales: [],
		};
	}
	const loaders = Object.fromEntries(
		lazy.map((locale) => [locale, `#build/${localeTemplate(locale)}`]),
	);
	return {
		plugin: {
			filename: PLUGIN_TEMPLATE,
			getContents: () =>
				pluginSource({
					catalogues: { [fallbackLocale]: catalogues[fallbackLocale] ?? {} },
					fallbackLocale,
					cookie,
					loaders,
				}),
		},
		types,
		locales: lazy.map((locale) => ({
			filename: localeTemplate(locale),
			getContents: () => catalogueModuleSource(catalogues[locale] ?? {}),
		})),
	};
}
