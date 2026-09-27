/**
 * The dotted-path keys of a nested object: `Path<{ a: { b: string } }>` is
 * `'a.b'`. A copy of `@nxgt/i18n`'s own `Path`, inlined rather than imported:
 * it is the only thing this package ever took from `@nxgt/i18n`, and a
 * required peer over one pure-type utility forced every consumer — including
 * `@nxgt/mail-i18n` — to install `@nxgt/i18n` and its `hono` dependency for
 * nothing their code ever runs.
 */
type PathImpl<T, K extends keyof T> = K extends string
	? T[K] extends Record<string, any>
		? `${K}.${Path<T[K]>}`
		: K
	: never;

type Path<T> = PathImpl<T, keyof T>;

/** The values a message's arguments take: `{ name: 'Ada', count: 3 }`. */
export type MessageArgs = Readonly<Record<string, string | number | Date>>;

/** A locale, or a function that answers it at each call — as in `@nxgt/i18n`. */
export type LanguageProvider = string | (() => string);

/**
 * Every key of the app's catalogues, with its arguments. Empty here; the
 * generated declaration file fills it from the catalogues —
 * `i18nTypes()` for Vite, the Nuxt module for Nuxt — so an editor completes a
 * key and flags an unknown one. With no key registered, `t` takes any string.
 *
 * ```ts
 * declare module '@nxgt/i18n-vue' {
 *   interface I18nMessages {
 *     'home.greeting': { name: string | number };
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by the generated file.
export interface I18nMessages {}

/**
 * Every locale of the app's catalogues, as keys. Filled by the same generated
 * file: `interface I18nLocales { en: true; fr: true }`. With none registered, a
 * locale is any string.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by the generated file.
export interface I18nLocales {}

/** A key of `M`, or any string while `M` declares none. */
export type KeyOf<M> = [keyof M] extends [never] ? string : keyof M & string;

/** A key of the registered catalogues, or any string while none is registered. */
export type MessageKey = KeyOf<I18nMessages>;

/** A registered locale, or any string while none is registered. */
export type Locale = [keyof I18nLocales] extends [never]
	? string
	: keyof I18nLocales & string;

/**
 * The dotted keys of a catalogue written in TypeScript or imported from JSON,
 * with `@nxgt/i18n`'s `Path`: `CatalogueKey<typeof en>` is
 * `'home.title' | 'home.greeting'`. For `createTranslator<CatalogueKey<…>>`
 * when no types are generated.
 */
export type CatalogueKey<C> = Path<C>;

type Names<M, K> = K extends keyof M ? keyof M[K] : never;

/** The keys of `K` whose argument names are not all of `All`'s. */
type Uneven<M, K, All = K> = K extends keyof M
	? [Names<M, All>] extends [keyof M[K]]
		? never
		: K
	: never;

type Both<U> = (U extends unknown ? (u: U) => void : never) extends (
	i: infer I,
) => void
	? I
	: never;

/** Whether `K` is every key of `M`, when there are several. */
type Every<M, K> = [keyof M] extends [K]
	? [keyof M] extends [Both<keyof M>]
		? false
		: true
	: false;

/**
 * The arguments of `key` in `M`: none, its declared ones, or any while `M`
 * declares no key or `K` is not one of them. A key that may be one of several
 * messages (`ok ? 'a' : 'b'`) takes the arguments every one of them accepts;
 * the catalogues refuse an argument a message does not use, so they must all
 * use the same names. A key that may be any message takes any arguments:
 * TypeScript reads an unknown key as every key, and the key is then what it
 * reports.
 */
export type ArgsOf<M, K> = [keyof M] extends [never]
	? [args?: MessageArgs]
	: [K] extends [keyof M]
		? Every<M, K> extends true
			? [args?: MessageArgs]
			: [Uneven<M, K>] extends [never]
				? [Names<M, K>] extends [never]
					? [args?: Readonly<Record<string, never>>]
					: [args: Readonly<Both<M[K]>>]
				: [args: never]
		: [args?: MessageArgs];

/** The arguments of a registered key. */
export type MessageArgsOf<K> = ArgsOf<I18nMessages, K>;
