import { describe, expect, test } from 'bun:test';
import {
	isLocaleChunk,
	type ManifestEntry,
	skipLocalePrefetch,
} from './manifest';

// Keys as Nuxt 4.5's client manifest writes them, read off a build of test/nuxt-lazy-app.
const key = (locale: string) =>
	`../virtual:nuxt:node_modules%2F.cache%2Fnuxt%2F.nuxt%2Fnxgt-i18n-vue%2Flocales%2F${locale}.mjs`;
const entry = '../../node_modules/nuxt/dist/app/entry.js';

describe('skipLocalePrefetch', () => {
	test('neither prefetches nor preloads the locale chunks, and leaves every other entry', () => {
		const manifest: Record<string, ManifestEntry> = {
			[entry]: { prefetch: true, preload: true },
			[key('fr')]: { prefetch: true, preload: true },
			[key('de')]: { prefetch: true, preload: true },
			'_BDNMzG2s.js': { prefetch: true, preload: true },
		};
		skipLocalePrefetch(manifest, ['fr', 'de']);
		expect(manifest).toEqual({
			[entry]: { prefetch: true, preload: true },
			[key('fr')]: { prefetch: false, preload: false },
			[key('de')]: { prefetch: false, preload: false },
			'_BDNMzG2s.js': { prefetch: true, preload: true },
		});
	});

	test('matches the template of a locale it was given, decoded, and nothing else', () => {
		expect(isLocaleChunk(key('fr'), ['fr'])).toBe(true);
		expect(
			isLocaleChunk('/app/.nuxt/nxgt-i18n-vue/locales/pt-BR.mjs', ['pt-BR']),
		).toBe(true);
		expect(isLocaleChunk(key('fr'), ['de'])).toBe(false);
		expect(isLocaleChunk(key('fr-CA'), ['fr'])).toBe(false);
		expect(isLocaleChunk('locales/fr.mjs', ['fr'])).toBe(false);
		expect(isLocaleChunk('%E0%A4%A', ['fr'])).toBe(false);
	});
});
