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

/**
 * The message under `key` in `language`'s catalogue, if that language has one
 * of its own (not `constructor` through the prototype) and the key leads to a
 * message, not a branch.
 */
function messageIn(
	resources: Record<string, any>,
	language: string,
	key: string,
): string | undefined {
	if (!Object.hasOwn(resources, language)) return undefined;
	const message = _.get(resources[language], key);
	return typeof message === 'string' ? message : undefined;
}

/**
 * A translator over `resources`. A key the language lacks — or a language
 * with no catalogue at all — is looked up in the fallback language
 * (`getFallbackLanguage()`), and only then answered as the key itself.
 */
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
		let locale = language;
		let found = messageIn(resources, language, key);
		const fallback = getFallbackLanguage();
		if (found === undefined && fallback !== language) {
			found = messageIn(resources, fallback, key);
			locale = fallback;
		}
		let message = found ?? key;
		try {
			message = new IntlMessageFormat(message, locale).format(context);
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
