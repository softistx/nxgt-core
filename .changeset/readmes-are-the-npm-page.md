---
'@nxgt/datasource-rest': patch
'@nxgt/i18n': patch
'@nxgt/security': patch
'@nxgt/shared': patch
'@nxgt/shared-events': patch
'@nxgt/shared-exceptions': patch
'@nxgt/shared-graphql': patch
'@nxgt/shared-hono': patch
'@nxgt/shared-logging': patch
'@nxgt/shared-mongo': patch
'@nxgt/shared-openapi': patch
'@nxgt/shared-storage': patch
---

Write a real README for every package.

The README is in `files`, so it is the package's page on npmjs — the first
thing anyone outside these repositories reads. Ten of the twelve shipped the
`bun init` boilerplate ("To run: `bun run src/index.ts`", which is not how a
library is used), and five of those carried the **wrong package name** in the
heading: `@nxgt/shared-logging` announced itself as `@nxgt/shared`,
`@nxgt/shared-graphql` as `@nxgt/shared-exceptions`.

Each now says what the package is, tables its subpaths, and names what will
bite a consumer — `SHARED_SCHEMA_PATH` rather than a path into `src/`, `code`
against `errorCode`, why mongoose must be imported from `@nxgt/shared-mongo`,
which principal shape a context carries.
