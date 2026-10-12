---
"@nxgt/shared-mongo": patch
---

`createMigrationFile` writes a template that takes `ClientSession` and `Connection` from `@nxgt/shared-mongo`, as the README asks of app code, instead of from `mongoose`. The file is written already formatted, and `bunx @biomejs/biome` is no longer spawned, so creating a migration never downloads Biome.
