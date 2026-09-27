/**
 * `@nxgt/i18n-vue/nuxt/runtime` — what the Nuxt module's plugin runs, on
 * the server and in the browser. It takes Nuxt's composables as arguments
 * rather than importing them, so it holds no Nuxt import and is tested
 * without Nuxt.
 */

import { type Ref, watch } from 'vue';
import type { Catalogues } from '../../core/catalogues';
import { parseAcceptLanguage, pickLocale } from '../../core/locale';
import { createI18n, type I18n } from '../../vue';

export { STATE_KEY } from '../state-key';

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

/**
 * The i18n of one Nuxt request, or of the browser app. Its locale is, in
 * order: the state the server rendered in; the cookie; the visitor's
 * languages; the fallback locale — each matched as by `pickLocale`. A
 * `setLocale` writes the state and the cookie, so the next page rendered on
 * the server is in the same locale.
 */
export function setupNuxtI18n(context: NuxtI18nContext): I18n {
	const { catalogues, fallbackLocale, cookie, state } = context;
	const locales = Object.keys(catalogues);
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
	const i18n = createI18n({ catalogues, fallbackLocale, locale: state.value });
	watch(
		i18n.locale,
		(locale) => {
			state.value = locale;
			cookie.value = locale;
		},
		{ flush: 'sync' },
	);
	return i18n;
}
