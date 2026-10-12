import type { App, Ref } from 'vue';
import type { Catalogues } from '../core/catalogues';
import type { CatalogueLoaders } from '../core/loaders';
import type { Locale, MessageArgsOf, MessageKey } from '../core/types';

/** What `createI18n` takes. */
export interface I18nOptions {
	/** A catalogue per locale, as `{ en, fr }`. Checked when `createI18n` runs. */
	readonly catalogues: Catalogues;
	/**
	 * A loader per locale whose catalogue is fetched on demand, as
	 * `{ fr: () => import('./locales/fr.json') }`: the first `setLocale` to it
	 * runs the loader, checks the catalogue against the fallback locale, and
	 * switches once both are done. Optional; a locale that is also in
	 * `catalogues` is already loaded, and its loader never runs.
	 */
	readonly loaders?: CatalogueLoaders;
	/** The reference every other locale is checked against. Default the first locale of `catalogues`; always one of `catalogues`. */
	readonly fallbackLocale?: string;
	/** The locale to start in — from `pickLocale` or `detectLocale`. Default `fallbackLocale`; always one of `catalogues`. */
	readonly locale?: string;
}

/** The i18n of one app: a Vue plugin, and what `useI18n()` answers. */
export interface I18n {
	/** The current locale, reactive. Change it with `setLocale`. */
	readonly locale: Readonly<Ref<Locale>>;
	/** Every locale of the catalogues, in their order, then every locale only `loaders` has. */
	readonly locales: readonly Locale[];
	/** The reference locale. */
	readonly fallbackLocale: Locale;
	/**
	 * Switches every `t` of the app to `locale`. A locale that is neither in
	 * the catalogues nor in `loaders`, or that is not a string, **throws**
	 * synchronously.
	 *
	 * A loaded locale switches at once, and the promise is already resolved.
	 * One loaded on demand switches once its catalogue is loaded and checked;
	 * until then `locale` and `t` stay on the previous locale. The promise
	 * resolves when the switch is done, and rejects when the catalogue could
	 * not be loaded or cannot be right — the locale then unchanged. When
	 * calls overlap, the last one wins. On a server, `await` it before
	 * rendering.
	 */
	setLocale(locale: Locale): Promise<void>;
	/** The message `key` in the current locale. An unknown key, or an argument that cannot be right, **throws**. Reactive: a template re-renders when the locale changes. */
	t<K extends MessageKey>(key: K, ...args: MessageArgsOf<K>): string;
	/** Whether `key` is a message of the catalogues — for a key computed at run time. */
	has(key: string): key is MessageKey;
	/** `app.use(i18n)`: provides it to `useI18n()` and adds `t` to every template. */
	install(app: App): void;
}
