import {
	type App,
	type InjectionKey,
	inject,
	type Ref,
	type ShallowRef,
	shallowRef,
} from 'vue';
import { checkArguments } from './core/arguments';
import {
	type Catalogues,
	checkCatalogues,
	type Messages,
} from './core/catalogues';
import { isObject, LOCALE } from './core/guards';
import { normalizeKey } from './core/keys';
import { createFormatter, type Formatter } from './core/translator';
import type {
	Locale,
	MessageArgs,
	MessageArgsOf,
	MessageKey,
} from './core/types';

/** What `createI18n` takes. */
export interface I18nOptions {
	/** A catalogue per locale, as `{ en, fr }`. Checked when `createI18n` runs. */
	readonly catalogues: Catalogues;
	/** The reference every other locale is checked against. Default the first locale of `catalogues`. */
	readonly fallbackLocale?: string;
	/** The locale to start in — from `pickLocale` or `detectLocale`. Default `fallbackLocale`. */
	readonly locale?: string;
}

/** The i18n of one app: a Vue plugin, and what `useI18n()` answers. */
export interface I18n {
	/** The current locale, reactive. Change it with `setLocale`. */
	readonly locale: Readonly<Ref<Locale>>;
	/** Every locale of the catalogues, in their order. */
	readonly locales: readonly Locale[];
	/** The reference locale. */
	readonly fallbackLocale: Locale;
	/** Switches every `t` of the app to `locale`. A locale the catalogues do not have **throws**. */
	setLocale(locale: Locale): void;
	/** The message `key` in the current locale. An unknown key, or an argument that cannot be right, **throws**. Reactive: a template re-renders when the locale changes. */
	t<K extends MessageKey>(key: K, ...args: MessageArgsOf<K>): string;
	/** Whether `key` is a message of the catalogues — for a key computed at run time. */
	has(key: string): key is MessageKey;
	/** `app.use(i18n)`: provides it to `useI18n()` and adds `t` to every template. */
	install(app: App): void;
}

const I18N: InjectionKey<I18n> = Symbol('@nxgt/i18n-vue');

interface Prepared {
	readonly messages: ReadonlyMap<string, Messages>;
	readonly format: Formatter;
	/** Every fallback-locale key, normalized (camelCase and kebab-case fold together), to the key as the catalogue actually spells it. */
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

function prepare(
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
	const messages = checkCatalogues(catalogues, locales, fallbackLocale);
	const canonical = new Map<string, string>();
	for (const messageKey of (messages.get(fallbackLocale) as Messages).keys()) {
		canonical.set(normalizeKey(messageKey), messageKey);
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

function checkOptions(options: I18nOptions): {
	locales: string[];
	fallbackLocale: string;
	locale: string;
} {
	if (!isObject(options)) {
		throw new TypeError(
			'createI18n: options must be an object, as { catalogues: { en, fr } }',
		);
	}
	const { catalogues } = options;
	if (!isObject(catalogues) || !Object.values(catalogues).every(isObject)) {
		throw new TypeError(
			'createI18n: catalogues must be an object of catalogues by locale, as { en, fr }',
		);
	}
	const locales = Object.keys(catalogues);
	if (locales.length === 0) {
		throw new TypeError(
			'createI18n: catalogues must hold at least one locale, as { en, fr }',
		);
	}
	if (!locales.every((locale) => LOCALE.test(locale))) {
		throw new TypeError(
			'createI18n: catalogues holds something that is not a locale — key each catalogue by a BCP 47 tag, as en or pt-BR',
		);
	}
	const fallbackLocale = options.fallbackLocale ?? (locales[0] as string);
	if (!locales.includes(fallbackLocale)) {
		throw new TypeError(
			'createI18n: fallbackLocale must be a locale of the catalogues',
		);
	}
	const locale = options.locale ?? fallbackLocale;
	if (!locales.includes(locale)) {
		throw new TypeError(
			'createI18n: locale must be a locale of the catalogues — pick one with pickLocale',
		);
	}
	return { locales, fallbackLocale, locale };
}

/**
 * The i18n of a Vue app: its catalogues **checked** — the same keys in every
 * locale, no argument the fallback locale does not declare, every message
 * valid ICU — a reactive locale, and `t`.
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { createI18n, detectLocale } from '@nxgt/i18n-vue';
 * import en from './locales/en.json';
 * import fr from './locales/fr.json';
 *
 * const i18n = createI18n({ catalogues: { en, fr }, locale: detectLocale(['en', 'fr'], 'en') });
 * createApp(App).use(i18n).mount('#app');
 * ```
 *
 * A wrong option is a `TypeError`; a catalogue that cannot be right an
 * `Error` starting `i18n:`, naming the locale and the key. Create one per
 * request when rendering on a server: the locale is the i18n's own. The
 * catalogues are checked once per set of catalogue objects, so treat them as
 * immutable.
 */
export function createI18n(options: I18nOptions): I18n {
	const checked = checkOptions(options);
	const locales = checked.locales as Locale[];
	const fallbackLocale = checked.fallbackLocale as Locale;
	const { messages, format, canonical } = prepare(
		options.catalogues,
		locales,
		fallbackLocale,
	);
	const reference = messages.get(fallbackLocale) as Messages;
	const locale: ShallowRef<Locale> = shallowRef(checked.locale as Locale);

	const i18n: I18n = {
		locale,
		locales,
		fallbackLocale,
		setLocale(next) {
			if (typeof next !== 'string') {
				throw new TypeError('setLocale: the locale must be a string, as fr');
			}
			if (!locales.includes(next)) {
				throw new Error(
					'setLocale: the locale is not a locale of the catalogues — pick one with pickLocale',
				);
			}
			locale.value = next;
		},
		t(key: string, args: unknown = {}) {
			// Read first, so a template that throws below still re-renders on a switch.
			const current = locale.value;
			if (typeof key !== 'string') {
				throw new TypeError("t: the key must be a string, as t('home.title')");
			}
			// Exact first — a catalogue's own spelling always matches itself — then
			// falling back across camelCase and kebab-case: `t('sign-in')` finds a
			// catalogue's `signIn`, and the other way round.
			const actualKey = reference.has(key)
				? key
				: canonical.get(normalizeKey(key));
			const declared =
				actualKey !== undefined ? reference.get(actualKey) : undefined;
			if (declared === undefined) {
				throw new Error(`t: ${key} is not a key of the catalogues`);
			}
			checkArguments('t', key, declared, args);
			const message =
				messages.get(current)?.get(actualKey as string) ?? declared;
			return format(current, key, message.text, args as MessageArgs);
		},
		has(key): key is MessageKey {
			return (
				typeof key === 'string' &&
				(reference.has(key) || canonical.has(normalizeKey(key)))
			);
		},
		install(app) {
			app.provide(I18N, i18n);
			app.config.globalProperties.t = i18n.t;
		},
	} as I18n;
	return i18n;
}

/**
 * The i18n `app.use(createI18n(…))` installed — in a component's `setup`, or
 * anywhere `inject` works. Without one installed it **throws**.
 *
 * ```ts
 * const { t, locale, setLocale } = useI18n();
 * ```
 */
export function useI18n(): I18n {
	const i18n = inject(I18N, null);
	if (i18n === null || i18n === undefined) {
		throw new Error(
			'useI18n: no i18n is installed — app.use(createI18n({ catalogues })) first, in a component or where inject works',
		);
	}
	return i18n;
}

declare module 'vue' {
	interface ComponentCustomProperties {
		/** The message `key` in the current locale. An unknown key or a wrong argument is a type error, and throws. */
		t<K extends MessageKey>(key: K, ...args: MessageArgsOf<K>): string;
	}
}
