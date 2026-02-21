import type { LocaleKey, TranslationContext } from '@nxgt/i18n';
import type { FlatObject } from '@nxgt/shared';
import type { resources } from './resources';

export type StorageLocaleKey = keyof FlatObject<typeof resources.en, string>;

declare module '@nxgt/i18n' {
	export function translate(
		key: LocaleKey | StorageLocaleKey,
		context: TranslationContext = undefined,
	);
}
