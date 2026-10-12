import { type InjectionKey, inject, type ShallowRef, shallowRef } from 'vue';
import { checkArguments } from '../core/arguments';
import type { Messages } from '../core/catalogues';
import { localeSwitcher, onDemandCatalogues } from '../core/loaders';
import type {
	Locale,
	MessageArgs,
	MessageArgsOf,
	MessageKey,
} from '../core/types';
import { checkOptions } from './options';
import { prepare } from './prepare';
import type { I18n, I18nOptions } from './types';

export type { I18n, I18nOptions } from './types';

const I18N: InjectionKey<I18n> = Symbol('@nxgt/i18n-vue');

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
 *
 * `loaders` fetches a locale's catalogue on demand instead — the same
 * record whoever writes it, by hand or a build plugin:
 *
 * ```ts
 * const i18n = createI18n({
 *   catalogues: { en },
 *   loaders: { fr: () => import('./locales/fr.json') },
 * });
 * await i18n.setLocale('fr'); // loaded, checked, then switched
 * ```
 */
export function createI18n(options: I18nOptions): I18n {
	const checked = checkOptions(options);
	const eager = checked.locales as Locale[];
	const locales = [...eager, ...checked.lazyLocales] as Locale[];
	const fallbackLocale = checked.fallbackLocale as Locale;
	const { messages, format, canonical } = prepare(
		options.catalogues,
		eager,
		fallbackLocale,
	);
	const reference = messages.get(fallbackLocale) as Messages;
	const onDemand = onDemandCatalogues(
		checked.loaders,
		fallbackLocale,
		reference,
	);
	const locale: ShallowRef<Locale> = shallowRef(checked.locale as Locale);

	const i18n: I18n = {
		locale,
		locales,
		fallbackLocale,
		setLocale: localeSwitcher({
			locales,
			isEager: (next) => messages.has(next),
			onDemand,
			apply: (next) => {
				locale.value = next as Locale;
			},
		}),
		t(key: string, args: unknown = {}) {
			// Read first, so a template that throws below still re-renders on a switch.
			const current = locale.value;
			if (typeof key !== 'string') {
				throw new TypeError("t: the key must be a string, as t('home.title')");
			}
			// Exact first — a catalogue's own spelling always matches itself — then
			// falling back across camelCase and kebab-case: `t('sign-in')` finds a
			// catalogue's `signIn`, and the other way round.
			const actualKey = reference.has(key) ? key : canonical.get(key);
			const declared =
				actualKey !== undefined ? reference.get(actualKey) : undefined;
			if (declared === undefined) {
				throw new Error(`t: ${key} is not a key of the catalogues`);
			}
			checkArguments('t', key, declared, args);
			const lazy = onDemand.get(current);
			const message =
				(lazy?.messages ?? messages.get(current))?.get(actualKey as string) ??
				declared;
			return (lazy?.format ?? format)(
				current,
				key,
				message.text,
				args as MessageArgs,
			);
		},
		has(key): key is MessageKey {
			return (
				typeof key === 'string' && (reference.has(key) || canonical.has(key))
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
