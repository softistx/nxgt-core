import { supportedLanguages } from './catalogues';

export const LANGUAGE_KEY = 'language';

/**
 * The languages a catalogue is registered for: `en` and `fr`, then each one
 * `registerCatalogue()` adds. Live — a registration shows in it.
 */
export const SUPPORTED_LANGUAGES: readonly string[] = supportedLanguages();
