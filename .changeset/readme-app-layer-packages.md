---
'@nxgt/security': patch
'@nxgt/datasource-rest': patch
---

Ship READMEs that name the traps, not just the install.

`@nxgt/security` is rewritten as an npm page: subpaths, the opposite
nesting of `authorities` and `keto`, `unmatched` being REST-only, and the
schema that ships in `schema/`. `@nxgt/datasource-rest` now shows the
constructor and says downstream HTTP errors become `CustomException`.
