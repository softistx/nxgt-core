---
'@nxgt/shared-exceptions': patch
'@nxgt/shared-mongo': patch
'@nxgt/shared': patch
'@nxgt/shared-graphql': patch
---

The README and source comments name the consumer repositories generically. No code change in this entry. Through `@nxgt/shared-logging` 2.0.0, the audit and migration loggers of `@nxgt/shared-mongo` now print `[app]` by default instead of a private application's name.
