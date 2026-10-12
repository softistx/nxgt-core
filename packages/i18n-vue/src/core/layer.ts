import type { Catalogue, Catalogues } from './catalogues';
import { isObject } from './guards';

/** `over` merged into `under` key by key: an object is merged, anything else replaces. */
function mergeCatalogue(under: Catalogue, over: Catalogue): Catalogue {
	const out: Record<string, string | Catalogue> = { ...under };
	for (const [key, value] of Object.entries(over)) {
		const below = Object.hasOwn(out, key) ? out[key] : undefined;
		// Defined, not assigned: `out.__proto__ = …` would set the prototype and
		// hide the key from the check that refuses it.
		Object.defineProperty(out, key, {
			value:
				isObject(below) && isObject(value)
					? mergeCatalogue(below, value)
					: value,
			enumerable: true,
			writable: true,
			configurable: true,
		});
	}
	return out;
}

/**
 * Each of `project`'s locales, with `sources` merged under it in order: a
 * source's locale the project does not have is left out.
 */
export function layerCatalogues(
	sources: readonly Catalogues[],
	project: Record<string, Catalogue>,
): Record<string, Catalogue> {
	const out: Record<string, Catalogue> = {};
	for (const [locale, catalogue] of Object.entries(project)) {
		out[locale] = [...sources.map((source) => source[locale]), catalogue]
			.filter((layer): layer is Catalogue => layer !== undefined)
			.reduce(mergeCatalogue, {});
	}
	return out;
}
