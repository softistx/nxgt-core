import { mergeCatalogues } from './merge';
import { resources } from './resources';
import type { Catalogue, Language } from './types';

type ByLanguage = Record<Language, Catalogue>;

/**
 * The shape every 3.x copy of this package agrees on. It is a contract
 * between versions: a field added here needs a new symbol name.
 */
type State = {
	/** Each copy's built-in catalogues, merged: a newer copy's keys join. */
	base: ByLanguage;
	/** What the app registered, merged per language. */
	registered: ByLanguage;
	/** `base` under `registered`, what `translate` reads. */
	catalogues: ByLanguage;
	languages: Language[];
	fallback: Language;
};

/**
 * One state for the process, on `globalThis`, as the language sources are:
 * an app can hold two copies of this package — one a dependency of
 * `@nxgt/shared-hono`, one its own — and a catalogue registered through
 * either must translate through both. A 2.x copy has no such state and sees
 * none of it.
 */
const STATE = Symbol.for('@nxgt/i18n/catalogues@3');

/** No prototype: a language is a key, and `constructor` is a fine name. */
const byLanguage = (): ByLanguage => Object.create(null);

function refresh(state: State, language: Language): void {
	state.catalogues[language] = mergeCatalogues(
		state.base[language] ?? {},
		state.registered[language] ?? {},
	);
	if (!state.languages.includes(language)) state.languages.push(language);
}

function state(): State {
	const global = globalThis as { [STATE]?: State };
	global[STATE] ??= {
		base: byLanguage(),
		registered: byLanguage(),
		catalogues: byLanguage(),
		languages: [],
		fallback: 'en',
	};
	return global[STATE];
}

// Each copy adds its built-in catalogues when it loads: keys a newer copy
// ships reach every copy, and a key both ship keeps the first one's message.
{
	const shared = state();
	for (const [language, catalogue] of Object.entries(resources)) {
		shared.base[language] = mergeCatalogues(
			catalogue,
			shared.base[language] ?? {},
		);
		refresh(shared, language);
	}
}

/**
 * The catalogues `translate` reads, by language: this package's `en` and `fr`
 * and whatever was registered on top. The object is live — a registration
 * shows in it — and is read-only to callers.
 */
export function registeredCatalogues(): Readonly<ByLanguage> {
	return state().catalogues;
}

/**
 * The languages a catalogue is registered for. The array is live, the same
 * one `SUPPORTED_LANGUAGES` is.
 */
export function supportedLanguages(): readonly Language[] {
	return state().languages;
}

export type RegisterCatalogueOptions = {
	/**
	 * Replace what was registered for the language instead of merging over
	 * it: a reload drops the keys it no longer has. The package's own
	 * catalogue stays underneath either way.
	 */
	replace?: boolean;
};

/**
 * Registers `catalogue` for `language`, merged deeply over what that language
 * already has (`mergeCatalogues`): a key it names wins, a key it leaves out
 * keeps the package's message. A language with no catalogue yet becomes
 * supported — `getLanguage()` accepts it from a source or `localStorage`, and
 * `translate` answers in it. With `{ replace: true }`, earlier registrations
 * for the language are dropped first.
 */
export function registerCatalogue(
	language: Language,
	catalogue: Catalogue,
	{ replace = false }: RegisterCatalogueOptions = {},
): void {
	if (
		typeof language !== 'string' ||
		language === '' ||
		language === '__proto__'
	) {
		throw new TypeError(
			`@nxgt/i18n: registerCatalogue needs a language name, got ${JSON.stringify(language)}`,
		);
	}
	const shared = state();
	shared.registered[language] = mergeCatalogues(
		replace ? {} : (shared.registered[language] ?? {}),
		catalogue,
	);
	refresh(shared, language);
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
