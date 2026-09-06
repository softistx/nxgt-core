import { tryGetContext } from 'hono/context-storage';
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
 * Where the language comes from when the caller does not say.
 *
 * The two repositories had forked exactly this: sellix-monorepo read
 * `localStorage`, nxgt-federation read the Hono request context, and neither
 * could run where the other did — federation's fell back to `'en'` outside a
 * request, sellix's knew nothing about one. Asking both, most specific first,
 * serves either without a caller changing anything.
 *
 * `createTranslator` still takes a provider, so a caller that wants one source
 * and not the other passes it.
 */
export function getLanguage(): Language {
	const fromRequest: unknown = tryGetContext()?.get(LANGUAGE_KEY as never);
	if (
		typeof fromRequest === 'string' &&
		SUPPORTED_LANGUAGES.includes(fromRequest as Language)
	) {
		return fromRequest as Language;
	}
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
