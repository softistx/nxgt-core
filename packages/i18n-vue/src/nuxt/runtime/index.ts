/**
 * `@nxgt/i18n-vue/nuxt/runtime` — what the Nuxt module's plugin runs, on
 * the server and in the browser. It takes Nuxt's composables as arguments
 * rather than importing them, so it holds no Nuxt import and is tested
 * without Nuxt.
 */

import { type Ref, toRaw, watch } from 'vue';
import type { Catalogue, Catalogues } from '../../core/catalogues';
import { isObject } from '../../core/guards';
import { type CatalogueLoaders, unwrapModule } from '../../core/loaders';
import { parseAcceptLanguage, pickLocale } from '../../core/locale';
import { createI18n, type I18n } from '../../vue/index';

export { STATE_KEY } from '../state-key';

/**
 * The key of the lazily loaded catalogue in Nuxt's payload: the catalogue the
 * server rendered in, when it came from a loader, so the browser hydrates in
 * it without loading it again.
 */
export const CATALOGUE_STATE_KEY = '@nxgt/i18n-vue:catalogue';

/** What `setupNuxtI18n` needs from Nuxt. */
export interface NuxtI18nContext {
	/** The merged, checked catalogues, by locale. */
	readonly catalogues: Catalogues;
	/** The reference locale, and the answer when nothing else matches. */
	readonly fallbackLocale: string;
	/** The stored preference: `useCookie(name)`. Written on each `setLocale`. */
	readonly cookie: Ref<string | null | undefined>;
	/**
	 * The locale the server rendered in: `useState(key)`. It travels in the
	 * payload, so the browser hydrates in the same locale — no mismatch.
	 */
	readonly state: Ref<string | undefined>;
	/**
	 * What the visitor asks for, when there is no state yet: the
	 * `Accept-Language` header on the server, `navigator.languages` in a
	 * browser without server rendering.
	 */
	readonly requested: () => string | readonly string[] | null | undefined;
}

/** What `setupLazyNuxtI18n` needs from Nuxt, on top of `setupNuxtI18n`'s. */
export interface LazyNuxtI18nContext extends NuxtI18nContext {
	/**
	 * The catalogues loaded up front: the fallback locale's at least. The
	 * locales served on demand are in `loaders` instead.
	 */
	readonly catalogues: Catalogues;
	/** A loader per locale loaded on demand, as `createI18n`'s `loaders`. */
	readonly loaders: CatalogueLoaders;
	/** Every locale, each one in `catalogues` or `loaders`: what the locale is resolved among. */
	readonly locales: readonly string[];
	/**
	 * The catalogue the page was rendered in, when a loader answered it:
	 * `useState(CATALOGUE_STATE_KEY)`; `null` for a locale of `catalogues`.
	 * It travels in the payload, so the browser hydrates without loading it.
	 */
	readonly catalogue: Ref<Catalogue | null | undefined>;
}

/**
 * The i18n of one Nuxt request, or of the browser app. Its locale is, in
 * order: the state the server rendered in; the cookie; the visitor's
 * languages; the fallback locale — each matched as by `pickLocale`. A
 * `setLocale` writes the state and the cookie, so the next page rendered on
 * the server is in the same locale.
 */
export function setupNuxtI18n(context: NuxtI18nContext): I18n {
	const { catalogues, fallbackLocale, cookie, state } = context;
	const locale = resolveLocale(context, Object.keys(catalogues));
	const i18n = createI18n({ catalogues, fallbackLocale, locale });
	watch(
		i18n.locale,
		(next) => {
			state.value = next;
			cookie.value = next;
		},
		{ flush: 'sync' },
	);
	return i18n;
}

/**
 * The locale of the request, among `locales`: the state when it is one of
 * them, else the cookie, then the requested languages, then the fallback
 * locale, matched as by `pickLocale`. Writes it to the state, and never to
 * the cookie: a guessed locale is not a choice.
 */
function resolveLocale(
	context: NuxtI18nContext,
	locales: readonly string[],
): string {
	const { fallbackLocale, cookie, state } = context;
	if (state.value === undefined || !locales.includes(state.value)) {
		const requested = context.requested();
		const wanted =
			typeof requested === 'string' ||
			requested === null ||
			requested === undefined
				? parseAcceptLanguage(requested)
				: requested;
		state.value = pickLocale(
			[cookie.value, ...wanted],
			locales,
			fallbackLocale,
		);
	}
	return state.value;
}

/**
 * `setupNuxtI18n`, with locales loaded on demand. The locale is resolved the
 * same way, among `locales`; a locale of `loaders` is loaded before the
 * promise resolves, so the server renders in it — or, in the browser, read
 * from the catalogue state the server rendered in, with no loader call and
 * no flash of the fallback locale. A `setLocale` writes the state, the
 * cookie and the catalogue state together, so an `await setLocale(locale)`
 * on the server renders and hydrates in it.
 *
 * Rejects when the loader of the resolved locale rejects, or answers a
 * catalogue that cannot be right — with `setLocale`'s own error.
 */
export async function setupLazyNuxtI18n(
	context: LazyNuxtI18nContext,
): Promise<I18n> {
	const { catalogues, loaders, fallbackLocale, cookie, state, catalogue } =
		context;
	const isEager = (next: string) =>
		isObject(catalogues) && Object.hasOwn(catalogues, next);
	const isLazy = (next: string) =>
		isObject(loaders) && Object.hasOwn(loaders, next);
	checkLocales(context.locales, (next) => isEager(next) || isLazy(next));
	const rendered = state.value;
	const locale = resolveLocale(context, context.locales);
	// The payload's catalogue, in place of the loader: only when the state was
	// kept, so the catalogue state is the one rendered with it. Raw, since
	// `useState` answers a reactive proxy of it. Once loaded it is cached by
	// the i18n, and a failed check rejects the setup, so it is asked for once.
	const payload =
		!isEager(locale) && rendered === locale && isObject(catalogue.value)
			? toRaw(catalogue.value)
			: undefined;
	/** What each loader answered, unwrapped, for the catalogue state. */
	const answered = new Map<string, unknown>();
	// Only functions are wrapped: anything else reaches `createI18n` as it is,
	// which refuses it with its own `TypeError`.
	const recording: Record<string, unknown> = isObject(loaders)
		? { ...loaders }
		: {};
	for (const [lazy, loader] of Object.entries(recording)) {
		if (typeof loader !== 'function') continue;
		recording[lazy] = async () => {
			let answer: unknown;
			if (lazy === locale && payload !== undefined) {
				answer = payload;
			} else {
				answer = await loader();
			}
			answered.set(lazy, unwrapModule(answer));
			return answer;
		};
	}
	// A lazy catalogue goes through `loaders`, never `catalogues`: what
	// `catalogues` holds is cached as long as the fallback locale's
	// catalogue, and a loader may answer a new object per request.
	const i18n = createI18n({
		catalogues,
		loaders: (isObject(loaders) ? recording : loaders) as CatalogueLoaders,
		fallbackLocale,
		locale: isEager(locale) ? locale : fallbackLocale,
	});
	const catalogueOf = (next: string) =>
		isEager(next) ? null : ((answered.get(next) as Catalogue) ?? null);
	if (!isEager(locale)) await i18n.setLocale(locale);
	catalogue.value = catalogueOf(locale);
	// After the setup, so a guessed locale is never written to the cookie.
	watch(
		i18n.locale,
		(next) => {
			state.value = next;
			cookie.value = next;
			catalogue.value = catalogueOf(next);
		},
		{ flush: 'sync' },
	);
	return i18n;
}

/**
 * Refuses a `locales` entry that is neither in `catalogues` nor in `loaders`:
 * resolved from a cookie or a header, it could never be switched to.
 */
function checkLocales(
	locales: readonly string[],
	isKnown: (locale: string) => boolean,
): void {
	const stray = locales.find((locale) => !isKnown(locale));
	if (stray !== undefined) {
		throw new TypeError(
			`setupLazyNuxtI18n: locales holds ${stray}, which is neither in catalogues nor in loaders — give each locale a catalogue or a loader`,
		);
	}
}
