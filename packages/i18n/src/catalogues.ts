import { mergeCatalogues } from './merge';
import { resources } from './resources';
import type { Catalogue, Language } from './types';

type State = {
	catalogues: Record<Language, Catalogue>;
	languages: Language[];
	fallback: Language;
};

/**
 * One state for the process, on `globalThis`, as the language sources are:
 * an app can hold two copies of this package — one a dependency of
 * `@nxgt/shared-hono`, one its own — and a catalogue registered through
 * either must translate through both.
 */
const STATE = Symbol.for('@nxgt/i18n/catalogues');

function state(): State {
	const global = globalThis as { [STATE]?: State };
	global[STATE] ??= {
		catalogues: { ...resources },
		languages: Object.keys(resources),
		fallback: 'en',
	};
	return global[STATE];
}

/**
 * The catalogues `translate` reads, by language: this package's `en` and `fr`
 * and whatever was registered on top. The object is live — a registration
 * shows in it — and is read-only to callers.
 */
export function registeredCatalogues(): Readonly<Record<Language, Catalogue>> {
	return state().catalogues;
}

/**
 * The languages a catalogue is registered for. The array is live, the same
 * one `SUPPORTED_LANGUAGES` is.
 */
export function supportedLanguages(): readonly Language[] {
	return state().languages;
}

/**
 * Registers `catalogue` for `language`, merged deeply over what that language
 * already has (`mergeCatalogues`): a key it names wins, a key it leaves out
 * keeps the package's message. A language with no catalogue yet becomes
 * supported — `getLanguage()` accepts it from a source or `localStorage`, and
 * `translate` answers in it.
 */
export function registerCatalogue(
	language: Language,
	catalogue: Catalogue,
): void {
	if (typeof language !== 'string' || language === '') {
		throw new TypeError('@nxgt/i18n: registerCatalogue needs a language name');
	}
	const { catalogues, languages } = state();
	catalogues[language] = mergeCatalogues(catalogues[language] ?? {}, catalogue);
	if (!languages.includes(language)) languages.push(language);
}

/** The language `getLanguage()` answers when nothing else names one. */
export function getFallbackLanguage(): Language {
	return state().fallback;
}

/**
 * Changes the fallback language, `'en'` until then. It must have a catalogue:
 * register one first for a language this package does not ship.
 */
export function setFallbackLanguage(language: Language): void {
	if (!state().languages.includes(language)) {
		throw new RangeError(
			`@nxgt/i18n: no catalogue is registered for "${language}"; call registerCatalogue("${language}", …) first`,
		);
	}
	state().fallback = language;
}
