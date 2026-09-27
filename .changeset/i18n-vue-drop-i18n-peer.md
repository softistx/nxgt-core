---
"@nxgt/i18n-vue": patch
---

No longer requires installing `@nxgt/i18n`

`Path` — the only thing this package ever imported from `@nxgt/i18n` — is now
carried here instead of imported, so `@nxgt/i18n` is gone from
`peerDependencies` and `devDependencies`. `CatalogueKey` behaves exactly the
same; nothing about the public surface changes.

Installing `@nxgt/i18n-vue` no longer pulls in `@nxgt/i18n` and, through it,
`hono` — a difference a consumer that only wants the Vue layer, such as
`@nxgt/mail-i18n`, will notice in their install.
