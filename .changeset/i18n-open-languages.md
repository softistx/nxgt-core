---
"@nxgt/i18n": major
---

Languages are open, and catalogues merge deeply.

**Breaking:**

- `Language` is `string`, no longer `'en' | 'fr'`. The new `BuiltInLanguage` type is that union. `getLanguage()` returns `string`, so code that narrowed it to the union now narrows it itself.
- `FALLBACK_LANGUAGE` is removed. Use `getFallbackLanguage()` and `setFallbackLanguage()` instead.
- `SUPPORTED_LANGUAGES` is a live `readonly string[]`: it grows when a language is registered.

**New:**

- `registerCatalogue(language, catalogue)` merges a catalogue over what that language already has. A new language becomes supported by `getLanguage()` and `translate`, and the package's messages stay under an override.
- `setFallbackLanguage(language)` changes the language `getLanguage()` answers when nothing names one. It throws a `RangeError` for a language with no catalogue. `getFallbackLanguage()` reads it.
- `mergeCatalogues(base, ...overrides)` is a deep merge in which the last override wins leaf by leaf. It never changes its inputs and ignores `__proto__`. A spread such as `{ ...resources.en, validation }` replaced the package's whole `validation` branch; this merge keeps the keys the app did not repeat.
- `registeredCatalogues()` and `supportedLanguages()` read the registered state, which is shared on `globalThis` by two copies of the package.
- The `Catalogue` type.
