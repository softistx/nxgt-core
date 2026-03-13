import { resources } from './resources';
import type { Language } from './types';

export const LANGUAGE_KEY = 'language';

export const SUPPORTED_LANGUAGES = Object.keys(resources) as Language[];

export const FALLBACK_LANGUAGE: Language = 'en';
