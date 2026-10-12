import { isObject, LOCALE } from '../core/guards';
import type { CatalogueLoaders } from '../core/loaders';
import type { I18nOptions } from './types';

/** `createI18n`'s options checked: a wrong one is a `TypeError`. */
export function checkOptions(options: I18nOptions): {
	locales: string[];
	/** The locales only `loaders` has, in its order. */
	lazyLocales: string[];
	loaders: CatalogueLoaders;
	fallbackLocale: string;
	locale: string;
} {
	if (!isObject(options)) {
		throw new TypeError(
			'createI18n: options must be an object, as { catalogues: { en, fr } }',
		);
	}
	const { catalogues } = options;
	if (!isObject(catalogues) || !Object.values(catalogues).every(isObject)) {
		throw new TypeError(
			'createI18n: catalogues must be an object of catalogues by locale, as { en, fr }',
		);
	}
	const locales = Object.keys(catalogues);
	if (locales.length === 0) {
		throw new TypeError(
			'createI18n: catalogues must hold at least one locale, as { en, fr }',
		);
	}
	if (!locales.every((locale) => LOCALE.test(locale))) {
		throw new TypeError(
			'createI18n: catalogues holds something that is not a locale — key each catalogue by a BCP 47 tag, as en or pt-BR',
		);
	}
	const loaders = checkLoaders(options.loaders);
	const fallbackLocale = options.fallbackLocale ?? (locales[0] as string);
	if (!locales.includes(fallbackLocale)) {
		throw new TypeError(
			Object.hasOwn(loaders, fallbackLocale)
				? 'createI18n: fallbackLocale must be a locale of the catalogues, not one loaded on demand — the reference is checked when createI18n runs'
				: 'createI18n: fallbackLocale must be a locale of the catalogues',
		);
	}
	const locale = options.locale ?? fallbackLocale;
	if (!locales.includes(locale)) {
		throw new TypeError(
			Object.hasOwn(loaders, locale)
				? 'createI18n: locale must be a locale of the catalogues, not one loaded on demand — start in a loaded locale, then await setLocale(locale)'
				: 'createI18n: locale must be a locale of the catalogues — pick one with pickLocale',
		);
	}
	return {
		locales,
		lazyLocales: Object.keys(loaders).filter((lazy) => !locales.includes(lazy)),
		loaders,
		fallbackLocale,
		locale,
	};
}

/** `loaders` checked: an object of functions keyed by locale, or `{}` when not given. */
function checkLoaders(loaders: unknown): CatalogueLoaders {
	if (loaders === undefined) return {};
	if (
		!isObject(loaders) ||
		!Object.values(loaders).every((loader) => typeof loader === 'function')
	) {
		throw new TypeError(
			"createI18n: loaders must be an object of functions by locale, as { fr: () => import('./locales/fr.json') }",
		);
	}
	if (!Object.keys(loaders).every((locale) => LOCALE.test(locale))) {
		throw new TypeError(
			'createI18n: loaders holds something that is not a locale — key each loader by a BCP 47 tag, as fr or pt-BR',
		);
	}
	return loaders as CatalogueLoaders;
}
