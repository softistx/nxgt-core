import type { FlatObject } from '@nxgt/shared/types';
import type { resources } from '../resources';

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

export type { FlatObject };
