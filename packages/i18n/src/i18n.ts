import { IntlMessageFormat } from 'intl-messageformat';
import _ from 'lodash';
import { getFallbackLanguage, registeredCatalogues } from './catalogues';
import { LANGUAGE_KEY, SUPPORTED_LANGUAGES } from './consts';
import { languageFromSources } from './sources';
import type {
	Language,
	LanguageProvider,
	LocaleKey,
	TranslationContext,
} from './types';

/**
 * Where the language comes from when the caller does not say, most specific
 * first:
 *
 * 1. a registered source — `registerLanguageSource()`: a server's request
 *    context, which `@nxgt/shared-hono` registers for Hono and
 *    `@alxia/i18n` for alxia;
 * 2. `localStorage`, when that object exists;
 * 3. the fallback language — `'en'`, or what `setFallbackLanguage()` set.
 *
 * Until 2.0 this read Hono's request context itself, through
 * `hono/context-storage`, which tied every consumer — a browser bundle, an
 * alxia server — to Hono. The Hono part lives in `@nxgt/shared-hono` now.
 *
 * `createTranslator` still takes a provider, so a caller that wants one source
 * and not the others passes it.
 */
export function getLanguage(): Language {
	const fromSource = languageFromSources();
	if (fromSource !== undefined) return fromSource;
	if (typeof localStorage !== 'undefined') {
		const stored = localStorage.getItem(LANGUAGE_KEY);
		if (stored !== null && SUPPORTED_LANGUAGES.includes(stored)) return stored;
	}
	return getFallbackLanguage();
}

export function createTranslator<K extends string = LocaleKey>(
	resources: Record<string, any> = {},
	localeProvider: LanguageProvider = getLanguage,
) {
	return (
		key: K,
		context: TranslationContext = undefined,
		provideLanguage: LanguageProvider = localeProvider,
	): string => {
		const language =
			typeof provideLanguage === 'function'
				? provideLanguage()
				: provideLanguage;
		let message: string = _.get(resources[language], key) ?? key;
		try {
			message = new IntlMessageFormat(message, language).format(context);
		} catch (e) {
			console.error(e);
		}

		return message;
	};
}

/**
 * Translates with this package's catalogues and every one registered on top
 * (`registerCatalogue`), in `getLanguage()`'s language.
 */
export const translate = createTranslator(registeredCatalogues());
