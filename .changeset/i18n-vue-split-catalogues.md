---
"@nxgt/i18n-vue": minor
---

Splits a catalogue across files, or generates it in code, and exposes the loader for another build

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
