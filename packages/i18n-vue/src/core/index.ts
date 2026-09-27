/**
 * `@nxgt/i18n-vue/core` — the framework-free half: catalogues checked, a
 * strict translator, locale selection, and the types the generated file
 * fills. No import of `vue`, so a server or a build script uses it alone.
 */

export { checkArguments } from './arguments';
export {
	type ArgumentKind,
	type Catalogue,
	type Catalogues,
	checkCatalogues,
	layerCatalogues,
	type Message,
	type Messages,
} from './catalogues';
export {
	type DetectLocaleOptions,
	detectLocale,
	parseAcceptLanguage,
	pickLocale,
	type WantedLocales,
} from './locale';
export {
	createFormatter,
	createTranslator,
	type Formatter,
	lookup,
	type Translate,
} from './translator';
export type {
	ArgsOf,
	CatalogueKey,
	I18nLocales,
	I18nMessages,
	KeyOf,
	LanguageProvider,
	Locale,
	MessageArgs,
	MessageArgsOf,
	MessageKey,
} from './types';
