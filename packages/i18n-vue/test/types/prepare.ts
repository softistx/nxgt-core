/**
 * Writes `test/types/generated/i18n.d.ts` from `test/types/locales/`, as
 * `i18nTypes()` does in a Vite app — and `i18n.catalogues.d.ts` beside it,
 * as `i18nTypes({ lazy: true })` does — before `vue-tsc` checks the refusals
 * against it. Run by `bun run typecheck:types`.
 */

import { join } from 'node:path';
import { loadCatalogues, typesSource, writeTypes } from '../../src/vite';
import { virtualTypesFile, virtualTypesSource } from '../../src/vite/virtual';

const root = import.meta.dir;
const out = 'generated/i18n.d.ts';
const loaded = await loadCatalogues(root, { locales: ['en', 'fr'] });
writeTypes(
	join(root, out),
	out,
	typesSource(loaded.reference, loaded.fallbackLocale, {
		locales: loaded.locales,
	}),
);
const lazyOut = virtualTypesFile(out);
writeTypes(
	join(root, lazyOut),
	lazyOut,
	virtualTypesSource(loaded.fallbackLocale),
);
