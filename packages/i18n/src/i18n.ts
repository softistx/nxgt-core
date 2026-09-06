import { IntlMessageFormat } from 'intl-messageformat';
import _ from 'lodash';
import { FALLBACK_LANGUAGE, LANGUAGE_KEY } from './consts';
import { resources } from './resources';
import type {
	Language,
	LanguageProvider,
	LocaleKey,
	TranslationContext,
} from './types';

export function getLanguage() {
	if (typeof localStorage === 'undefined') {
		return FALLBACK_LANGUAGE;
	}
	return (
		localStorage.getItem(LANGUAGE_KEY) === 'fr' ? 'fr' : FALLBACK_LANGUAGE
	) as Language;
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
