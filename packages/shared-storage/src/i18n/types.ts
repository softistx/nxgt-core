import type { FlatObject } from '@nxgt/shared';
import type { resources } from './resources';

export type StorageLocaleKey = keyof FlatObject<typeof resources.en, string>;
