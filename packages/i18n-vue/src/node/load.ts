import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	type Catalogue,
	type Catalogues,
	checkCatalogues,
	layerCatalogues,
	type Messages,
} from '../core/catalogues';
import { isObject, LOCALE } from '../core/guards';

/** Where the catalogues of a project are, for the Vite plugin and the Nuxt module. */
export interface CatalogueSource {
	/** Every locale of the project, as BCP 47 tags: `['en', 'fr']`. */
	readonly locales: readonly string[];
	/** The reference every other locale is checked against, and the types are written from. Default the first locale. */
	readonly fallbackLocale?: string;
	/** The folder of `<locale>.json` catalogues, from the project's root. Default `locales`. */
	readonly dir?: string;
	/**
	 * Catalogues under the project's own, as a package ships them. Each is
	 * merged key by key under the next, and the project's `<locale>.json` over
	 * all of them.
	 */
	readonly catalogues?: readonly Catalogues[];
}

/** The catalogues of a project, merged and checked. */
export interface LoadedCatalogues {
	readonly locales: readonly string[];
	readonly fallbackLocale: string;
	/** The merged catalogues, by locale — what the app formats with. */
	readonly catalogues: Record<string, Catalogue>;
	/** Every checked message, by locale then by dotted key. */
	readonly messages: ReadonlyMap<string, Messages>;
	/** The fallback locale's messages, which declare every argument. */
	readonly reference: Messages;
}

/** Refuses options that are not a {@link CatalogueSource}, with a `TypeError` starting `<name>:`. */
export function checkCatalogueSource(
	name: string,
	options: unknown,
): asserts options is CatalogueSource {
	if (!isObject(options)) {
		throw new TypeError(
			`${name}: options must be an object, as { locales: ['en', 'fr'] }`,
		);
	}
	const { locales } = options;
	if (!Array.isArray(locales) || locales.length === 0) {
		throw new TypeError(
			`${name}: locales must hold at least one locale, as ['en', 'fr']`,
		);
	}
	for (const locale of locales) {
		if (typeof locale !== 'string' || !LOCALE.test(locale)) {
			throw new TypeError(
				`${name}: locales holds something that is not a locale — write each as a BCP 47 tag, as en or pt-BR`,
			);
		}
	}
	if (new Set(locales).size !== locales.length) {
		throw new TypeError(`${name}: locales holds the same locale twice`);
	}
	if (
		options.fallbackLocale !== undefined &&
		!locales.includes(options.fallbackLocale)
	) {
		throw new TypeError(`${name}: fallbackLocale must be one of locales`);
	}
	const { dir } = options;
	if (dir !== undefined && (typeof dir !== 'string' || dir === '')) {
		throw new TypeError(`${name}: dir must be a folder of the project`);
	}
	const { catalogues } = options;
	if (
		catalogues !== undefined &&
		(!Array.isArray(catalogues) ||
			!catalogues.every(
				(source) => isObject(source) && Object.values(source).every(isObject),
			))
	) {
		throw new TypeError(
			`${name}: catalogues must be a list of catalogues by locale, as [{ en: {...}, fr: {...} }]`,
		);
	}
}

/** Reads `<dir>/<locale>.json` for each locale. A missing or broken file **throws**, naming it as `<dirName>/<locale>.json`. */
export function readCatalogues(
	dir: string,
	dirName: string,
	locales: readonly string[],
): Record<string, Catalogue> {
	const out: Record<string, Catalogue> = {};
	for (const locale of locales) {
		const file = join(dir, `${locale}.json`);
		const name = `${dirName}/${locale}.json`;
		if (!existsSync(file)) {
			throw new Error(
				`i18n: ${name} is missing — every locale has a catalogue`,
			);
		}
		try {
			out[locale] = JSON.parse(readFileSync(file, 'utf8'));
		} catch {
			throw new Error(`i18n: ${name} is not valid JSON`);
		}
	}
	return out;
}

/**
 * Reads the project's catalogues under `root`, merges the packages' under
 * them, and checks the result. A missing file, a file that is not JSON, and
 * a catalogue that cannot be right **throw**, naming the locale and the key.
 */
export function loadCatalogues(
	root: string,
	source: CatalogueSource,
): LoadedCatalogues {
	const { locales } = source;
	const fallbackLocale = source.fallbackLocale ?? (locales[0] as string);
	const dirName = source.dir ?? 'locales';
	const catalogues = layerCatalogues(
		source.catalogues ?? [],
		readCatalogues(resolve(root, dirName), dirName, locales),
	);
	const messages = checkCatalogues(catalogues, locales, fallbackLocale);
	return {
		locales,
		fallbackLocale,
		catalogues,
		messages,
		reference: messages.get(fallbackLocale) as Messages,
	};
}
