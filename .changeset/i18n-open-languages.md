---
"@nxgt/i18n": major
---

Languages are open, and catalogues merge deeply.

**Breaking:**

- `Language` is `string`, no longer `'en' | 'fr'`. The new `BuiltInLanguage` type is that union. `getLanguage()` returns `string`, so code that narrowed it to the union now narrows it itself.
- `FALLBACK_LANGUAGE` is removed. Use `getFallbackLanguage()` and `setFallbackLanguage()` instead.
- `SUPPORTED_LANGUAGES` is a live `readonly string[]`: it grows when a language is registered. `languageFromSources()` returns `string | undefined`, and `LanguageProvider` takes any string.
- A key missing from the requested language is looked up in the fallback language before the translator answers the key itself. This applies to `translate` and to any `createTranslator`, including a language that has no catalogue at all. A path that leads to a branch rather than a message answers the key.

**New:**

- `registerCatalogue(language, catalogue)` merges a catalogue over what that language already has. A new language becomes supported by `getLanguage()` and `translate`, and the package's messages stay under an override.
- `setFallbackLanguage(language)` changes the language `getLanguage()` answers when nothing names one. It throws a `RangeError` for a language with no catalogue. `getFallbackLanguage()` reads it.
- `mergeCatalogues(base, ...overrides)` is a deep merge in which the last override wins leaf by leaf. It never changes its inputs and ignores `__proto__`. A spread such as `{ ...resources.en, validation }` replaced the package's whole `validation` branch; this merge keeps the keys the app did not repeat.
- `registeredCatalogues()` and `supportedLanguages()` read the registered state. Two 3.x copies of the package share it on `globalThis`, and the keys a newer copy ships reach both. A 2.x copy does not share it, so every `@nxgt/*` dependency must resolve `@nxgt/i18n` 3 before a registration reaches it.
- `registerCatalogue` throws a `TypeError` for an empty name, `__proto__` or a catalogue that is not an object. `mergeCatalogues` throws one for an argument that is not an object.
- The `Catalogue` type.
