import { tryGetContext } from 'hono/context-storage';
import { IntlMessageFormat } from 'intl-messageformat';
import _ from 'lodash';
import { FALLBACK_LANGUAGE, LANGUAGE_KEY } from './consts';
import { resources } from './resources';
import type { Language, LocaleKey, TranslationContext } from './types';

export function getLanguage() {
	if (typeof localStorage === 'undefined') {
		try {
			return (
				tryGetContext()?.get(LANGUAGE_KEY as never) === 'fr'
					? 'fr'
					: FALLBACK_LANGUAGE
			) as Language;
		} catch (e) {
			console.warn(
				`Failed to get language from context, falling back to ${FALLBACK_LANGUAGE}`,
				e,
			);
			return FALLBACK_LANGUAGE as Language;
		}
	}
	return (
		localStorage.getItem(LANGUAGE_KEY) === 'fr' ? 'fr' : FALLBACK_LANGUAGE
	) as Language;
}

export function createTranslator<K extends string = LocaleKey>(
	resources: Record<string, any> = {},
	localeProvider: () => Language = getLanguage,
) {
	return (
		key: K,
		context: TranslationContext = undefined,
		language: Language = localeProvider(),
	): string => {
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
