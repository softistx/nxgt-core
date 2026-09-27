# @nxgt/i18n-vue

## 0.1.1

### Patch Changes

- [#144](https://github.com/softistx/nxgt-core/pull/144) [`ad03dca`](https://github.com/softistx/nxgt-core/commit/ad03dca4d6b6b20c509c329e60a28e8342bbece7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accepts a message key segment written in kebab-case or camelCase
  
  The convention is kebab-case, the one `@nxgt/i18n` uses — `'auth.sign-in'`,
  not `'auth.signIn'` — and a catalogue may now be written in it. camelCase is
  still accepted, for a catalogue written before this. Either way, `t()` finds
  the message whichever convention the caller uses, even when it differs from
  the catalogue's own: a catalogue key `signIn` is found by `t('auth.sign-in')`
  and the other way round, on `createI18n().t`, `useI18n().t`, and the
  framework-free `createTranslator`.
  
  The generated types (`i18nTypes()`, the Nuxt module) complete and check both
  spellings of a key, not only the one the catalogue happens to use.
  
  This covers message key segments only — an ICU argument name (`{firstName}`)
  is still camelCase-only.
- Updated dependencies [[`9dcd56d`](https://github.com/softistx/nxgt-core/commit/9dcd56d9c9c4155a2e7384c65210dc2110ca4cfd)]:
  - @nxgt/i18n@1.1.0

## 0.1.0

### Minor Changes

- [#141](https://github.com/softistx/nxgt-core/pull/141) [`5ee21f8`](https://github.com/softistx/nxgt-core/commit/5ee21f8cc0c03bb3a6910affd5db35614e4b39fe) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First release: i18n for a Vue or Nuxt app, on `@nxgt/i18n`'s conventions
  
  `createI18n({ catalogues: { en, fr } })` checks the catalogues — the same keys
  in every locale, no argument the fallback locale does not declare, every
  message valid ICU — and installs as a Vue plugin: `t` in every template,
  `useI18n()` in code, a reactive locale switched with `setLocale`. `t` throws
  where `@nxgt/i18n` answers the key: an unknown key, an argument left out, one
  the message does not use or of the wrong kind.
  
  - `@nxgt/i18n-vue/core` — the same without `vue`: `createTranslator`,
    `checkCatalogues`, `layerCatalogues`, and `pickLocale`,
    `parseAcceptLanguage`, `detectLocale` to choose the locale.
  - `@nxgt/i18n-vue/vite` — `i18nTypes()`, which checks the catalogues at build
    time and writes `src/generated/i18n.d.ts`, so `t('…')` is completed and
    checked in `.vue` templates by `vue-tsc`.
  - `@nxgt/i18n-vue/nuxt` — a Nuxt 4 module: the locale is resolved on the
    server (the `language` cookie, then `Accept-Language`), sent in the payload
    so the browser hydrates in it, and written to the cookie on `setLocale`;
    the types of `t` go to `.nuxt/types/`, and `useI18n` is auto-imported.
  
  `vue` and `@nxgt/i18n` are required peers; `vite`, `nuxt` and `@nuxt/kit`
  optional ones, imported only by their subpaths.
