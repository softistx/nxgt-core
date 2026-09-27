/** What {@link pickLocale} accepts as the wanted locales. */
export type WantedLocales =
	| string
	| null
	| undefined
	| readonly (string | null | undefined)[];

const normalise = (locale: string) =>
	locale.trim().replace(/_/g, '-').toLowerCase();
const languageOf = (locale: string) => normalise(locale).split('-')[0] ?? '';

/**
 * The locale to render in: the first wanted locale `supported` holds, or
 * `fallback`.
 *
 * `wanted` is in order of preference — typically a stored preference, then
 * the visitor's `Accept-Language` (see {@link parseAcceptLanguage}) or
 * `navigator.languages`.
 * For each wanted locale in turn, an exact match wins (case and `_` or `-`
 * do not matter), then a match on the language alone: `fr-CA` picks `fr`,
 * and `fr` picks `fr-CA` when that is the only French supported. Nothing
 * matching, or nothing wanted, answers `fallback`.
 *
 * Pure, with no request context: pass what you have — a cookie, a user's
 * field, a header.
 *
 * Throws a `TypeError` when `supported` is empty or does not hold `fallback`.
 * That is a wiring mistake, not a request's.
 */
export function pickLocale<const L extends string>(
	wanted: WantedLocales,
	supported: readonly L[],
	fallback: NoInfer<L>,
): L {
	if (supported.length === 0) {
		throw new TypeError('pickLocale: supported must hold at least one locale');
	}
	if (!supported.includes(fallback)) {
		throw new TypeError('pickLocale: fallback must be one of supported');
	}

	const list = Array.isArray(wanted) ? wanted : [wanted];
	for (const locale of list) {
		if (typeof locale !== 'string' || locale.trim() === '') continue;
		const exact = supported.find((s) => normalise(s) === normalise(locale));
		if (exact !== undefined) return exact;
		const language = languageOf(locale);
		const sameLanguage =
			supported.find((s) => normalise(s) === language) ??
			supported.find((s) => languageOf(s) === language);
		if (sameLanguage !== undefined) return sameLanguage;
	}
	return fallback;
}

/**
 * The locales of an `Accept-Language` header, most wanted first.
 *
 * Entries are ordered by their `q` weight, ties keeping the header's order;
 * `q=0` entries and `*` are dropped. A missing or empty header answers `[]`.
 *
 * ```ts
 * parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8'); // ['fr-CA', 'fr', 'en']
 * ```
 */
export function parseAcceptLanguage(
	header: string | null | undefined,
): string[] {
	if (typeof header !== 'string') return [];
	return header
		.split(',')
		.map((entry, index) => {
			const [tag = '', ...params] = entry.split(';').map((p) => p.trim());
			const q = params
				.map((p) => /^q=([0-9.]+)$/i.exec(p)?.[1])
				.find((v) => v !== undefined);
			const weight = q === undefined ? 1 : Number(q);
			return { tag, weight: Number.isNaN(weight) ? 0 : weight, index };
		})
		.filter(({ tag, weight }) => tag !== '' && tag !== '*' && weight > 0)
		.sort((a, b) => b.weight - a.weight || a.index - b.index)
		.map(({ tag }) => tag);
}

/** Where {@link detectLocale} reads the browser's preference. */
export interface DetectLocaleOptions {
	/** The `localStorage` key of a stored preference. Default `'language'`, as `@nxgt/i18n`'s `LANGUAGE_KEY`. `false` reads none. */
	readonly storageKey?: string | false;
}

function storedLocale(storageKey: string | false): string | null {
	if (storageKey === false) return null;
	try {
		return globalThis.localStorage?.getItem(storageKey) ?? null;
	} catch {
		// Storage that refuses to be read (a sandboxed frame, a privacy mode) is
		// no preference, not a failure.
		return null;
	}
}

/**
 * The locale of a browser app with no server: a stored preference
 * (`localStorage.language`), then the browser's languages
 * (`navigator.languages`), then `fallback` — each matched as by
 * {@link pickLocale}. Outside a browser it answers `fallback`.
 *
 * ```ts
 * const locale = detectLocale(['en', 'fr'], 'en');
 * ```
 *
 * A server-rendered app resolves the locale on the server instead — a cookie,
 * then `Accept-Language` — so the client hydrates in the same language:
 * that is what the Nuxt module does.
 */
export function detectLocale<const L extends string>(
	supported: readonly L[],
	fallback: NoInfer<L>,
	options: DetectLocaleOptions = {},
): L {
	const storageKey = options.storageKey ?? 'language';
	if (
		storageKey !== false &&
		(typeof storageKey !== 'string' || storageKey === '')
	) {
		throw new TypeError(
			'detectLocale: storageKey must be a localStorage key, or false to read none',
		);
	}
	const languages =
		typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
	return pickLocale(
		[storedLocale(storageKey), ...languages],
		supported,
		fallback,
	);
}
