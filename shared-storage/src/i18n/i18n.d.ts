import type { TranslationContext } from '@nxgt/i18n';
import type { StorageLocaleKey } from './types';

declare module '@nxgt/i18n' {
	export function translate(
		key: StorageLocaleKey,
		context: TranslationContext = undefined,
	);
}
