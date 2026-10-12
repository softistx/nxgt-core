/** The key of the locale in Nuxt's payload: the server's choice, which the browser hydrates with. */
export const STATE_KEY = '@nxgt/i18n-vue:locale';

/**
 * The key of the lazily loaded catalogue in Nuxt's payload: the catalogue the
 * server rendered in, when it came from a loader, so the browser hydrates in
 * it without loading it again.
 */
export const CATALOGUE_STATE_KEY = '@nxgt/i18n-vue:catalogue';
