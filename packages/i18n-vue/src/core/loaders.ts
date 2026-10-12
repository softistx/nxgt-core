import { type Catalogue, checkLocale, type Messages } from './catalogues';
import { isObject } from './guards';
import { createFormatter, type Formatter } from './translator';

/**
 * One locale's catalogue, fetched when `setLocale` first asks for it:
 * `() => import('./locales/fr.json')`. It answers the catalogue, or a module
 * whose default export is one — what a dynamic `import()` of a JSON file
 * answers under Bun, Vite or Node.
 */
export type CatalogueLoader = () => Promise<
	Catalogue | { readonly default: Catalogue }
>;

/** A loader per locale: `{ fr: () => import('./locales/fr.json') }`. */
export type CatalogueLoaders = Readonly<Record<string, CatalogueLoader>>;

/** One locale's catalogue loaded on demand: checked, with a formatter of its own. */
export interface LoadedCatalogue {
	readonly messages: Messages;
	/**
	 * Its own, because a formatter caches by locale and key: two catalogue
	 * objects for one locale — two builds, a test double — must not share a
	 * compiled message.
	 */
	readonly format: Formatter;
}

/**
 * The catalogues loaded on demand and checked, keyed on the reference
 * messages they were checked against, then on the catalogue object itself.
 * A server creates an i18n per request, and each loads its locale anew:
 * `import()` answers the same module, so the same object is checked once.
 * Never through `createI18n`'s own cache, whose entries live as long as the
 * fallback locale's catalogue: one per request would pile up there.
 */
const checked = new WeakMap<Messages, WeakMap<object, LoadedCatalogue>>();

/** A module namespace — what `import()` answers — told apart from a catalogue that has a `default` key. */
const isModule = (value: unknown): value is { readonly default?: unknown } =>
	isObject(value) &&
	(value as { [Symbol.toStringTag]?: unknown })[Symbol.toStringTag] ===
		'Module';

async function loadCatalogue(
	loaders: CatalogueLoaders,
	locale: string,
	fallbackLocale: string,
	reference: Messages,
): Promise<LoadedCatalogue> {
	let answer: unknown;
	try {
		answer = await (loaders[locale] as () => unknown)();
	} catch (cause) {
		throw new Error(
			`setLocale: the catalogue of ${locale} could not be loaded`,
			{
				cause,
			},
		);
	}
	const catalogue = isModule(answer) ? answer.default : answer;
	if (!isObject(catalogue)) {
		throw new TypeError(
			`setLocale: the loader of ${locale} must answer a catalogue, or a module whose default export is one`,
		);
	}
	let byCatalogue = checked.get(reference);
	if (byCatalogue === undefined) {
		byCatalogue = new WeakMap();
		checked.set(reference, byCatalogue);
	}
	const hit = byCatalogue.get(catalogue);
	if (hit !== undefined) return hit;
	const loaded: LoadedCatalogue = {
		messages: checkLocale(catalogue, locale, fallbackLocale, reference),
		format: createFormatter('t'),
	};
	byCatalogue.set(catalogue, loaded);
	return loaded;
}

/** The catalogues one i18n loads on demand. */
export interface OnDemandCatalogues {
	/** The locale's catalogue, once loaded and checked; `undefined` before. */
	get(locale: string): LoadedCatalogue | undefined;
	/**
	 * Loads and checks the locale's catalogue. Calls made while a load is in
	 * flight share it; a load that fails is forgotten, so the next call runs
	 * the loader again. Rejects with `setLocale: …` when the loader fails or
	 * answers something else than a catalogue, and with the check's own
	 * `i18n: …` when the catalogue cannot be right.
	 */
	load(locale: string): Promise<LoadedCatalogue>;
}

/**
 * The catalogues of `loaders`, loaded on demand and checked against
 * `reference`, the fallback locale's messages. Internal: what `createI18n`
 * runs behind `setLocale`.
 */
export function onDemandCatalogues(
	loaders: CatalogueLoaders,
	fallbackLocale: string,
	reference: Messages,
): OnDemandCatalogues {
	const loaded = new Map<string, LoadedCatalogue>();
	const inFlight = new Map<string, Promise<LoadedCatalogue>>();
	return {
		get: (locale) => loaded.get(locale),
		load(locale) {
			const pending = inFlight.get(locale);
			if (pending !== undefined) return pending;
			const load = loadCatalogue(
				loaders,
				locale,
				fallbackLocale,
				reference,
			).then(
				(catalogue) => {
					loaded.set(locale, catalogue);
					inFlight.delete(locale);
					return catalogue;
				},
				(error: unknown) => {
					inFlight.delete(locale);
					throw error;
				},
			);
			inFlight.set(locale, load);
			return load;
		},
	};
}

/** What `localeSwitcher` switches between. */
export interface LocaleSwitcherOptions {
	/** Every locale `setLocale` accepts: the catalogues', then the loaders'. */
	readonly locales: readonly string[];
	/** Whether the locale is one of the catalogues given up front. */
	readonly isEager: (locale: string) => boolean;
	readonly onDemand: OnDemandCatalogues;
	/** Makes `locale` the current one. */
	readonly apply: (locale: string) => void;
}

/**
 * `setLocale`: bad input throws synchronously; a loaded locale is applied at
 * once; one in `loaders` is applied once loaded and checked, unless a later
 * call came in meanwhile — the last call wins. A superseded call whose load
 * succeeds resolves without switching; one whose load fails still rejects.
 */
export function localeSwitcher(
	options: LocaleSwitcherOptions,
): (locale: string) => Promise<void> {
	const { locales, isEager, onDemand, apply } = options;
	/** Bumped by every call: a load that ends after a later call switches nothing. */
	let latest = 0;
	return (next) => {
		if (typeof next !== 'string') {
			throw new TypeError('setLocale: the locale must be a string, as fr');
		}
		if (!locales.includes(next)) {
			throw new Error(
				'setLocale: the locale is not a locale of the catalogues — pick one with pickLocale',
			);
		}
		const call = ++latest;
		if (isEager(next) || onDemand.get(next) !== undefined) {
			apply(next);
			return Promise.resolve();
		}
		return onDemand.load(next).then(() => {
			if (call === latest) apply(next);
		});
	};
}
