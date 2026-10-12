import type { Catalogue } from '../core/catalogues';

/**
 * The source of an ES module whose default export is `catalogue`: what a
 * build serves for a locale loaded on demand, so `() => import(<it>)` is a
 * loader `createI18n` takes as is. `catalogue` is the merged one —
 * `loadCatalogues`' — so the folder layout and layered packages hold there
 * exactly as in the types. Internal: shared by the Vite plugin and the Nuxt
 * module, never exported from the package.
 */
export function catalogueModuleSource(catalogue: Catalogue): string {
	return `export default ${JSON.stringify(catalogue)};\n`;
}
