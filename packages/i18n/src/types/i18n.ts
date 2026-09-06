import type { resources } from '../resources';
import type { FlatObject } from './path';

export type LocaleKey = keyof FlatObject<typeof resources.en, string>;

export type Language = keyof typeof resources;

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

export type LanguageProvider = () => Language | Language;
