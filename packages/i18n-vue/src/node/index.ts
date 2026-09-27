/**
 * `@nxgt/i18n-vue/node` — the loader alone, for a build that is neither Vite
 * nor Nuxt: reads a project's resources object from `dir` (today's
 * `<locale>.json`, and `<locale>/**\/*.json` with the path as a key prefix)
 * or from `messages`, merges the packages' catalogues under it, and checks
 * the result. Node-only — kept out of `.` and `/core`, which a browser also
 * imports.
 *
 * ```ts
 * import { loadCatalogues } from '@nxgt/i18n-vue/node';
 *
 * const loaded = await loadCatalogues(process.cwd(), { locales: ['en', 'fr'] });
 * ```
 */

export {
	type CatalogueSource,
	checkCatalogueSource,
	type LoadedCatalogues,
	loadCatalogues,
	loadMessages,
	type ReadCatalogues,
	readCatalogues,
} from './load';
export {
	type TypesSourceOptions,
	typesSource,
	writeIfChanged,
	writeTypes,
} from './types-source';
