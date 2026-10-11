# @nxgt/i18n-vue

## 0.3.0

### Minor Changes

- [#245](https://github.com/softistx/nxgt-core/pull/245) [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accepts TypeScript 7 as well as 6: the `typescript` peer is now `^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set installs with either and no peer conflict. The package does not use TypeScript at runtime; its built JavaScript and declarations are checked under both. Nothing changes under TypeScript 6. Checking `t()` in `.vue` templates still takes `vue-tsc`, which needs TypeScript 6; under TypeScript 7, `tsc` checks `t()` in `.ts` files.

## 0.2.0

### Minor Changes

- [#149](https://github.com/softistx/nxgt-core/pull/149) [`9e9bee3`](https://github.com/softistx/nxgt-core/commit/9e9bee3a186ef97efe84020cd617d62067e7f7dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Splits a catalogue across files, or generates it in code, and exposes the loader for another build
  
  `dir` (the Vite plugin, the Nuxt module) now also reads
  `<dir>/<locale>/**/*.json`, alongside today's flat `<dir>/<locale>.json`: a
  folder file's path is a key prefix — `locales/en/mails.json` is `mails.*`,
  `locales/en/auth/sign-in.json` is `auth.sign-in.*`. Every locale must have the
  same files as the fallback locale, and a key two sources both define — the
  flat file and a folder file, or two folder files — **fails the build**,
  naming both files. A bad path segment (not camelCase or kebab-case) fails the
  same way, naming the file.
  
  `messages` is a new, alternative option — not with `dir` — naming a module
  whose default export is the resources object (`{ en: {...}, fr: {...} }`) or
  a function that returns it, for catalogues generated in code rather than read
  from files. Import the same module in the app, so `createI18n` runs on
  exactly what the types were written from.
  
  `@nxgt/i18n-vue/node` is a new, Node-only subpath: the shared loader
  (`loadCatalogues`, `loadMessages`, `readCatalogues`, `checkCatalogueSource`,
  and the types generator) `/vite` is built on, for a build that is neither
  Vite nor Nuxt.
  
  `loadCatalogues` and `readCatalogues` are now **async**, and `readCatalogues`
  takes an added `fallbackLocale` parameter — both needed to load `messages`
  and to check a folder's file parity. `LoadedCatalogues` gains `files` and
  `folders`, the paths read, for a caller to watch.
  
  See [Splitting catalogues](https://github.com/softistx/nxgt-core/blob/develop/packages/i18n-vue/docs/guide/catalogues.md#splitting-catalogues).

## 0.1.2

### Patch Changes

- [#146](https://github.com/softistx/nxgt-core/pull/146) [`52705b9`](https://github.com/softistx/nxgt-core/commit/52705b9c04aa92d4ec4258ab66453353471c38bb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - No longer requires installing `@nxgt/i18n`
  
  `Path` — the only thing this package ever imported from `@nxgt/i18n` — is now
  carried here instead of imported, so `@nxgt/i18n` is gone from
  `peerDependencies` and `devDependencies`. `CatalogueKey` behaves exactly the
  same; nothing about the public surface changes.
  
  Installing `@nxgt/i18n-vue` no longer pulls in `@nxgt/i18n` and, through it,
  `hono` — a difference a consumer that only wants the Vue layer, such as
  `@nxgt/mail-i18n`, will notice in their install.

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
