import { localeTemplate } from './templates';

/** What the hook reads and writes of an entry of Nuxt's client manifest. */
export interface ManifestEntry {
	prefetch?: boolean;
	preload?: boolean;
}

/**
 * Whether `key`, a key of Nuxt's client manifest, is the chunk of one of the
 * locale modules of `locales`. Measured on Nuxt 4.5: a template is keyed by
 * its virtual id, URL-encoded —
 * `../virtual:nuxt:node_modules%2F.cache%2Fnuxt%2F.nuxt%2Fnxgt-i18n-vue%2Flocales%2Ffr.mjs`
 * — so the key is decoded and matched on its end.
 */
export function isLocaleChunk(
	key: string,
	locales: readonly string[],
): boolean {
	let decoded: string;
	try {
		decoded = decodeURIComponent(key);
	} catch {
		return false;
	}
	return locales.some((locale) =>
		decoded.endsWith(`/${localeTemplate(locale)}`),
	);
}

/**
 * For `build:manifest`: neither prefetches nor preloads the chunks of the
 * locale modules of `locales`. Nuxt writes a `<link rel="prefetch">` for every
 * dynamic import, so without this every page would download every locale
 * once the browser is idle — the bytes `lazy` is there to save. A locale's
 * chunk is fetched when the page switches to it, and only then.
 */
export function skipLocalePrefetch(
	manifest: Record<string, ManifestEntry>,
	locales: readonly string[],
): void {
	for (const [key, entry] of Object.entries(manifest)) {
		if (!isLocaleChunk(key, locales)) continue;
		entry.prefetch = false;
		entry.preload = false;
	}
}
