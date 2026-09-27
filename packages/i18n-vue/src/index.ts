/**
 * `@nxgt/i18n-vue` — i18n for a Vue app, on `@nxgt/i18n`'s conventions.
 *
 * ```ts
 * import { createI18n } from '@nxgt/i18n-vue';
 *
 * app.use(createI18n({ catalogues: { en, fr } }));
 * ```
 *
 * A template writes `{{ t('home.title') }}`; a component `useI18n()`. The
 * framework-free half is also `@nxgt/i18n-vue/core`.
 */

export * from './core';
export { createI18n, type I18n, type I18nOptions, useI18n } from './vue';
