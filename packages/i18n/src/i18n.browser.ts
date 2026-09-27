import { IntlMessageFormat } from 'intl-messageformat';
import _ from 'lodash';
import { FALLBACK_LANGUAGE, LANGUAGE_KEY, SUPPORTED_LANGUAGES } from './consts';
import { resources } from './resources';
import type {
	Language,
	LanguageProvider,
	LocaleKey,
	TranslationContext,
} from './types';

/**
 * The browser build of {@link getLanguage} from `./i18n`.
 *
 * A bundler that resolves the `browser` export condition (Vite, Nuxt's client
 * build) gets this file instead: it never imports `hono/context-storage`,
 * which pulls in `node:async_hooks` — absent in a browser and dead weight in
 * a client bundle that never runs inside a Hono request. There is no request
 * context to ask in a browser anyway, so the behaviour a consumer sees is the
 * same: `localStorage`, then the fallback language.
 */
export function getLanguage(): Language {
	if (typeof localStorage !== 'undefined') {
		const stored = localStorage.getItem(LANGUAGE_KEY);
		if (SUPPORTED_LANGUAGES.includes(stored as Language)) {
			return stored as Language;
		}
	}
	return FALLBACK_LANGUAGE;
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

export const translate = createTranslator(resources);
