---
"@nxgt/shared-hono": minor
---

`c.get('language')` is typed `string`, following `@nxgt/i18n` 3.0, where `Language` is any registered language rather than `'en' | 'fr'`. Code that assigned it to `'en' | 'fr'` now narrows it itself, for example with `SUPPORTED_LANGUAGES.includes()`. Runtime behaviour is unchanged.
