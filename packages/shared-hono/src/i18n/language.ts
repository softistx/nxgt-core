import {
	LANGUAGE_KEY,
	type LanguageSource,
	registerLanguageSource,
} from '@nxgt/i18n';
import { tryGetContext } from 'hono/context-storage';

/**
 * The Hono request's language, for `@nxgt/i18n`'s `getLanguage()`: the
 * `language` variable — what `hono/language`'s `languageDetector()` sets — of
 * the request `contextStorage()` holds. Nothing outside a request, or before
 * a detector ran.
 *
 * `@nxgt/i18n` read it itself until 2.0, which tied every consumer to Hono.
 */
export const honoLanguageSource: LanguageSource = () => {
	const language: unknown = tryGetContext()?.get(LANGUAGE_KEY as never);
	return typeof language === 'string' ? language : undefined;
};

/**
 * Registers `honoLanguageSource` with `@nxgt/i18n`, and answers the function
 * that removes it. Registering twice keeps one.
 *
 * Importing `@nxgt/shared-hono` does it already: an app on these middlewares
 * translates in the request's language as it did before `@nxgt/i18n` 2.0.
 * Call it when you import only `@nxgt/i18n` beside Hono.
 */
export function useHonoLanguage(): () => void {
	return registerLanguageSource(honoLanguageSource);
}

useHonoLanguage();
