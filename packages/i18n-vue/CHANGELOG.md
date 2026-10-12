# @nxgt/i18n-vue

## 0.4.0

### Minor Changes

- [#301](https://github.com/softistx/nxgt-core/pull/301) [`2129dfe`](https://github.com/softistx/nxgt-core/commit/2129dfee781445e557b897b60be44c98a0793ab2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **`setLocale` now returns `Promise<void>` instead of `void`.** A call that ignores the result behaves exactly as before: a locale of `catalogues` switches synchronously and the promise is already resolved. Only code that implements the `I18n` interface by hand (a test double, a wrapper) has to return a promise from its `setLocale`.
  
  `createI18n` takes an optional `loaders` record, `{ fr: () => import('./locales/fr.json') }`, to load a locale's catalogue on demand: the first `setLocale` to it runs the loader, checks the catalogue against the fallback locale, and switches once both are done, keeping `locale` and `t` on the previous locale meanwhile. The last call wins: a superseded call resolves without switching when its load succeeds, and still rejects when it fails. A locale has one load in flight at a time, and a failed load is retried on the next call. A module namespace is unwrapped to its default export when its `Symbol.toStringTag` is `'Module'`, when it mirrors its default export (every other key the same value as `default`'s, as a bundle without splitting answers), or when it is frozen, prototype-less and has an object `default` (Rollup's namespace when no top-level key of the JSON is an identifier); a plain `{ default: {...} }` stays a catalogue. It is plain `import()` and needs no plugin: Bun, Vite, webpack and esbuild import JSON as is, and plain Node ESM with `{ with: { type: 'json' } }`. Without `loaders`, the API and the generated plugin and types are unchanged, but `createI18n` now always carries the loader and switcher code: about +0.7 kB gzip in a catalogues-only client bundle. A `.ts` file that calls `setLocale` without awaiting it is now flagged by `@typescript-eslint/no-floating-promises`. New exports: the `CatalogueLoader` and `CatalogueLoaders` types. New errors: `setLocale: the catalogue of <locale> could not be loaded` (with the loader's error as `cause`), `setLocale: the loader of <locale> must answer a catalogue, or a module whose default export is one`, and four `createI18n: …` `TypeError`s for a wrong `loaders`, raised only when `loaders` is given.

- [#303](https://github.com/softistx/nxgt-core/pull/303) [`d7cd742`](https://github.com/softistx/nxgt-core/commit/d7cd742a0ba4b76f149a5f3c848367ac9825c491) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/i18n-vue/nuxt/runtime` adds `setupLazyNuxtI18n(context): Promise<I18n>`, `LazyNuxtI18nContext` and `CATALOGUE_STATE_KEY` (`'@nxgt/i18n-vue:catalogue'`), for a Nuxt plugin whose locales are loaded on demand. The locale is resolved as `setupNuxtI18n` resolves it (the state, the cookie, the requested languages, the fallback locale), among `locales`; a locale of `loaders` is loaded before the promise resolves, so the server renders in it, and the catalogue it rendered in travels in the payload (`useState(CATALOGUE_STATE_KEY)`), so the browser hydrates in it without calling the loader. A `setLocale` writes the state, the cookie and the catalogue state together, so `await setLocale(locale)` on the server renders and hydrates in it; a locale guessed from `Accept-Language` is still never written to the cookie. A loader that rejects while the locale is resolved rejects the setup with `setLocale: the catalogue of <locale> could not be loaded`. A catalogue a loader answers stays on `createI18n`'s `loaders` path and is never cached per request, so a loader that answers a new object each time does not grow a server's memory. A `locales` entry in neither `catalogues` nor `loaders` is refused up front with the `TypeError` `setupLazyNuxtI18n: locales holds <locale>, which is neither in catalogues nor in loaders — give each locale a catalogue or a loader`. `setupNuxtI18n` is unchanged.

- [#304](https://github.com/softistx/nxgt-core/pull/304) [`44de825`](https://github.com/softistx/nxgt-core/commit/44de825a05f669ee57aad0de4907bc95cd6037d2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The Nuxt module takes an optional `lazy: true` (`nxgtI18n: { locales, lazy: true }`) that loads every locale but the fallback one on demand: it writes `.nuxt/nxgt-i18n-vue/locales/<locale>.mjs` per other locale (its merged catalogue, folder layout and packages' `catalogues` included), and a plugin that inlines the fallback catalogue alone, imports each other locale with `import('#build/nxgt-i18n-vue/locales/<locale>.mjs')` and awaits `setupLazyNuxtI18n`. `nuxt build` emits a chunk per locale, absent from the entry chunk, and the module turns off Nuxt's prefetch and preload of those chunks, so the browser fetches one only when the page switches to it; the server loads the visitor's catalogue before it renders, and the catalogue it rendered in travels in the payload, so the browser hydrates without fetching it. `setLocale` answers a promise resolved once the chunk is loaded: `await` it on the server. The locale is resolved among `locales` in the configured order, as without `lazy`; `useI18n().locales` lists the fallback locale first, as `createI18n` orders `catalogues` then `loaders`. The types under `.nuxt/` are the same. Without `lazy`, nothing changes: the plugin and the types are byte for byte the same. `pluginSource` and `PluginSourceOptions` take an optional `loaders` (module specifiers by locale) that switches to that plugin, and `locales`, the order the locale is resolved in. New error: `nxgtI18n: lazy must be true or false, as { locales: ['en', 'fr'], lazy: true }`, a `TypeError`.

- [#302](https://github.com/softistx/nxgt-core/pull/302) [`3d84ba5`](https://github.com/softistx/nxgt-core/commit/3d84ba5754211baf3129da7e806d957ad79a5988) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `i18nTypes` takes an optional `lazy: true` that serves the catalogues as modules for `createI18n`'s `loaders`: `virtual:@nxgt/i18n-vue/catalogues` exports `fallbackLocale`, `locales`, `catalogues` (the fallback locale's alone, inline) and `loaders` (one `import('virtual:@nxgt/i18n-vue/locale/<locale>')` per other locale, so `vite build` emits a chunk per locale). Each locale module is the merged catalogue — flat file, folder layout and packages' `catalogues` — exactly what the types are written from. In `vite dev`, a catalogue change that checks invalidates the modules and reloads the page; a broken one is logged and the modules keep the last good catalogues. Their types go to a second file beside `out`, `<out>.catalogues.d.ts` (`src/generated/i18n.catalogues.d.ts` by default). Without `lazy`, nothing changes: no module is served and `i18n.d.ts` is byte for byte the same; with it, `i18n.d.ts` is unchanged too. New error: `i18nTypes: lazy must be true or false, as i18nTypes({ locales, lazy: true })`, a `TypeError`.

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
