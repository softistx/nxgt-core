import { IntlMessageFormat } from 'intl-messageformat';
import type { Catalogue, Catalogues } from './catalogues';
import type {
	ArgsOf,
	I18nMessages,
	LanguageProvider,
	MessageArgs,
	MessageKey,
} from './types';

/**
 * `t(key, args?, language?)`: the message `key`, formatted in the language.
 * `K` is the keys it takes — the registered ones by default — and a
 * registered key takes its declared arguments.
 */
export type Translate<K extends string = MessageKey> = <Key extends K>(
	key: Key,
	...rest: [...ArgsOf<I18nMessages, Key>, language?: LanguageProvider]
) => string;

/** The message at dotted `key` in `catalogue`, or `null` when there is none. */
export function lookup(catalogue: Catalogue, key: string): string | null {
	let node: string | Catalogue | undefined = catalogue;
	for (const segment of key.split('.')) {
		if (typeof node !== 'object' || !Object.hasOwn(node, segment)) return null;
		node = node[segment];
	}
	return typeof node === 'string' ? node : null;
}

const resolveLanguage = (language: LanguageProvider): unknown =>
	typeof language === 'function' ? language() : language;

/** Formats `text`, the message at `key` in `locale`, with `args`. */
export type Formatter = (
	locale: string,
	key: string,
	text: string,
	args?: MessageArgs,
) => string;

/**
 * Formats with a cache of compiled messages, one per locale and key. A
 * message that does not format **throws**, `<prefix>: <locale>: <key> could
 * not be formatted`, the formatter's error as the cause.
 *
 * Tags are text (`ignoreTag`): `<b>{name}</b>` formats to the characters
 * `<b>Ada</b>`, which Vue's `{{ }}` escapes like any other text.
 */
export function createFormatter(prefix: string): Formatter {
	const compiled = new Map<string, IntlMessageFormat>();
	return (locale, key, text, args) => {
		const id = `${locale}\u0000${key}`;
		try {
			let format = compiled.get(id);
			if (format === undefined) {
				format = new IntlMessageFormat(text, locale, undefined, {
					ignoreTag: true,
				});
				compiled.set(id, format);
			}
			return String(format.format(args));
		} catch (cause) {
			throw new Error(`${prefix}: ${locale}: ${key} could not be formatted`, {
				cause,
			});
		}
	};
}

/**
 * The translator of `@nxgt/i18n`, strict: `createTranslator(catalogues,
 * getLanguage)` answers `t(key, args?, language?)`.
 *
 * Where `@nxgt/i18n` answers the key, this **throws**: a key the language's
 * catalogue does not have, a language with no catalogue, and a message that
 * does not format. Framework-free: it neither checks the catalogues nor reads
 * a reactive locale — `createI18n` does both.
 *
 * ```ts
 * import en from './locales/en.json';
 * import fr from './locales/fr.json';
 *
 * const t = createTranslator({ en, fr }, () => pickLocale(user.locale, ['en', 'fr'], 'en'));
 * t('home.title');
 * ```
 */
export function createTranslator<K extends string = MessageKey>(
	catalogues: Catalogues,
	getLanguage: LanguageProvider,
): Translate<K> {
	if (typeof catalogues !== 'object' || catalogues === null) {
		throw new TypeError(
			'createTranslator: catalogues must be an object of catalogues by locale, as { en, fr }',
		);
	}
	if (typeof getLanguage !== 'string' && typeof getLanguage !== 'function') {
		throw new TypeError(
			'createTranslator: getLanguage must be a locale or a function that answers one',
		);
	}
	const format = createFormatter('t');
	const translate = (
		key: string,
		args?: MessageArgs,
		language: LanguageProvider = getLanguage,
	): string => {
		const locale = resolveLanguage(language);
		if (typeof locale !== 'string') {
			throw new TypeError(
				't: the language must be a string — a locale, or a function that answers one',
			);
		}
		if (typeof key !== 'string') {
			throw new TypeError("t: the key must be a string, as t('home.title')");
		}
		if (!Object.hasOwn(catalogues, locale)) {
			throw new Error(
				't: the language is not a locale of the catalogues — pick one with pickLocale',
			);
		}
		const text = lookup(catalogues[locale] as Catalogue, key);
		if (text === null) throw new Error(`t: ${locale}: ${key} is not a key`);
		return format(locale, key, text, args);
	};
	return translate as Translate<K>;
}
