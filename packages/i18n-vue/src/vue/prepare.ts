import type { Catalogues, Messages } from '../core/catalogues';
import { checkCatalogues } from '../core/catalogues';
import { keyVariants } from '../core/keys';
import { createFormatter, type Formatter } from '../core/translator';

/** One set of catalogues checked: its messages, its formatter, and the other spellings of its keys. */
export interface Prepared {
	readonly messages: ReadonlyMap<string, Messages>;
	readonly format: Formatter;
	/** Every other-convention spelling of a fallback-locale key (`keyVariants`), to the key as the catalogue actually spells it. */
	readonly canonical: ReadonlyMap<string, string>;
}

interface CacheEntry {
	readonly fallbackLocale: string;
	readonly catalogues: Catalogues;
	readonly prepared: Prepared;
}

/**
 * The checked messages and the compiled formats, keyed on the fallback
 * locale's catalogue object, then matched on every locale's object by
 * identity. A server creates an i18n per request, often as
 * `createI18n({ catalogues: { en, fr } })` — a new wrapper each time around
 * the same imported catalogues: they are checked and compiled once, not per
 * request.
 */
const cache = new WeakMap<object, CacheEntry[]>();

const sameCatalogues = (a: Catalogues, b: Catalogues) => {
	const keys = Object.keys(a);
	return (
		keys.length === Object.keys(b).length &&
		keys.every((locale) => Object.hasOwn(b, locale) && a[locale] === b[locale])
	);
};

/**
 * The catalogues checked and compiled — once per set of catalogue objects,
 * from the cache above.
 */
export function prepare(
	catalogues: Catalogues,
	locales: readonly string[],
	fallbackLocale: string,
): Prepared {
	const key = catalogues[fallbackLocale] as object;
	const entries = cache.get(key) ?? [];
	const hit = entries.find(
		(entry) =>
			entry.fallbackLocale === fallbackLocale &&
			sameCatalogues(entry.catalogues, catalogues),
	);
	if (hit !== undefined) return hit.prepared;
	// checkCatalogues has already refused two keys that collide once cases
	// fold (see catalogues.ts), so building this from every key's exact
	// variants — not a lossy fold — cannot silently prefer one over another.
	const messages = checkCatalogues(catalogues, locales, fallbackLocale);
	const canonical = new Map<string, string>();
	for (const messageKey of (messages.get(fallbackLocale) as Messages).keys()) {
		for (const variant of keyVariants(messageKey)) {
			canonical.set(variant, messageKey);
		}
	}
	const prepared: Prepared = {
		messages,
		format: createFormatter('t'),
		canonical,
	};
	entries.push({ fallbackLocale, catalogues: { ...catalogues }, prepared });
	cache.set(key, entries);
	return prepared;
}
