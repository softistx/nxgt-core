import type { resources } from '../resources';
import type { FlatObject } from './path';

export type LocaleKey = keyof FlatObject<typeof resources.en, string>;

/**
 * A language name, as a catalogue is registered under it: `'en'`, `'fr'`,
 * `'pt-BR'`. Since 3.0 any string — a language is data an app registers, not
 * a list this package fixes. `SUPPORTED_LANGUAGES` says which have one.
 */
export type Language = string;

/** The languages this package ships catalogues for. */
export type BuiltInLanguage = keyof typeof resources;

/** Messages by key, nested: `{ errors: { 'not-found': '…' } }`. */
export type Catalogue = { readonly [key: string]: string | Catalogue };

export type TranslationContext =
	| {
			[k: string]:
				| ((children: any) => any)
				| string
				| number
				| boolean
				| object
				| Record<string, any>;
	  }
	| undefined;

export type LanguageProvider = (() => Language) | Language;
