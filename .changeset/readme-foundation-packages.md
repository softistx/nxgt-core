---
'@nxgt/i18n': patch
'@nxgt/shared-logging': patch
---

Ship READMEs that name the traps, not just the install.

`@nxgt/i18n` now says how `getLanguage` resolves (request, then
`localStorage`, then `'en'`) and that `createTranslator` takes a service's
own catalogues. `@nxgt/shared-logging` now says that importing the package
constructs a default `logger` against `logs/` relative to the process cwd —
a container that mounts nothing there crashes on the first import, not on
the first `createLogger` call — and that `Logger` is this package's export
because naming winston's type through a nested `node_modules` is TS2883.
