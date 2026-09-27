---
"@nxgt/i18n-vue": minor
---

First release: i18n for a Vue or Nuxt app, on `@nxgt/i18n`'s conventions

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
