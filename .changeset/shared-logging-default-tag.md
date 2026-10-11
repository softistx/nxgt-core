---
'@nxgt/shared-logging': minor
---

**BREAKING:** the default log label is now `app`, where it used to be a private application's name. Every line a logger prints without a `tag` now reads `[app]`. Pass `tag` to `createLogger` to keep your previous label.
