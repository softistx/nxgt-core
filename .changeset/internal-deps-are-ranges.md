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

Depend on siblings by range, not by exact version.

`workspace:*` publishes as the exact version, so `@nxgt/shared-hono@1.0.2`
demanded `@nxgt/shared-mongo@1.0.0` while the consuming app's own `^1.0.0`
resolved to `1.1.0`. Both landed in the tree, each registered the `Audit` and
`Migration` Mongoose models, and the second threw `OverwriteModelError` — 52
failing specs in nxgt-federation, and two copies of the package in
sellix-monorepo already.

Internal dependencies are now `workspace:^`, which publishes as a caret range
and dedupes. `verify-artifacts.ts` fails on an exact sibling pin so this cannot
come back.
