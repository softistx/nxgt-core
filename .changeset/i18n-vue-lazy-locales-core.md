---
"@nxgt/i18n-vue": minor
---

**`setLocale` now returns `Promise<void>` instead of `void`.** A call that ignores the result behaves exactly as before: a locale of `catalogues` switches synchronously and the promise is already resolved. Only code that implements the `I18n` interface by hand (a test double, a wrapper) has to return a promise from its `setLocale`.

`createI18n` takes an optional `loaders` record, `{ fr: () => import('./locales/fr.json') }`, to load a locale's catalogue on demand: the first `setLocale` to it runs the loader, checks the catalogue against the fallback locale, and switches once both are done, keeping `locale` and `t` on the previous locale meanwhile. The last call wins, a locale has one load in flight at a time, and a failed load is retried on the next call. It is plain `import()`, so it works under Bun, Node or any bundler with no plugin; without `loaders`, nothing changes. New exports: the `CatalogueLoader` and `CatalogueLoaders` types. New errors: `setLocale: the catalogue of <locale> could not be loaded` (with the loader's error as `cause`), `setLocale: the loader of <locale> must answer a catalogue, or a module whose default export is one`, and four `createI18n: …` `TypeError`s for a wrong `loaders`, raised only when `loaders` is given.
