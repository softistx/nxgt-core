---
"@nxgt/i18n-vue": patch
---

Accepts a message key segment written in kebab-case or camelCase

The convention is kebab-case, the one `@nxgt/i18n` uses — `'auth.sign-in'`,
not `'auth.signIn'` — and a catalogue may now be written in it. camelCase is
still accepted, for a catalogue written before this. Either way, `t()` finds
the message whichever convention the caller uses, even when it differs from
the catalogue's own: a catalogue key `signIn` is found by `t('auth.sign-in')`
and the other way round, on `createI18n().t`, `useI18n().t`, and the
framework-free `createTranslator`.

The generated types (`i18nTypes()`, the Nuxt module) complete and check both
spellings of a key, not only the one the catalogue happens to use.

This covers message key segments only — an ICU argument name (`{firstName}`)
is still camelCase-only.
