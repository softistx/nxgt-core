---
'@nxgt/i18n': patch
'@nxgt/shared-logging': patch
'@nxgt/shared-exceptions': patch
'@nxgt/shared': patch
'@nxgt/shared-mongo': patch
'@nxgt/shared-storage': patch
'@nxgt/shared-events': patch
'@nxgt/shared-hono': patch
'@nxgt/shared-graphql': patch
'@nxgt/shared-openapi': patch
'@nxgt/security': patch
'@nxgt/datasource-rest': patch
---

Ship complete npm pages for every package.

Each README now has the same shape — what it is, install, subpaths, usage,
then the traps — and covers the public API a consumer actually imports,
not just the one-line summary. `@nxgt/security` keeps the engine, keto,
unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
paths and the Oathkeeper paragraph that no longer name anything.
