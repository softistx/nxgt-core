import { createTranslator } from '@nxgt/i18n';
import { resources } from './resources';
import type { StorageLocaleKey } from './types';

export const translate = createTranslator<StorageLocaleKey>(resources);
