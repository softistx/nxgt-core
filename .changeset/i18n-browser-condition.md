---
"@nxgt/i18n": minor
---

A `browser` export condition, for a client bundle

`import { translate } from '@nxgt/i18n'` is unchanged, but a bundler that
resolves the `browser` condition (Vite, Nuxt's client build) now gets an
entry that never imports `hono/context-storage` — the only thing here that
is Node-only. `getLanguage()` behaves the same either way: it just drops the
Hono request-context step there is no request to read in a browser, and
falls straight to `localStorage`, then `FALLBACK_LANGUAGE`.

Also moves `intl-messageformat` to `^12.1.2`, to match the version
`@nxgt/i18n-vue` pins.
