---
"@nxgt/i18n": major
"@nxgt/shared-hono": minor
"@nxgt/shared-graphql": minor
---

`@nxgt/i18n` no longer reads the Hono request context: `getLanguage()` asks the language sources registered with `registerLanguageSource()`, then `localStorage`, then the fallback, and the package no longer depends on `hono`. `@nxgt/shared-hono` registers the Hono source (`honoLanguageSource`, `useHonoLanguage()`) when imported and declares `c.get('language')`; `@nxgt/shared-graphql`'s `createYogaHono()` registers it too. An app on `@nxgt/shared-hono` sees no difference; one that used `@nxgt/i18n` beside Hono without it calls `useHonoLanguage()`.
