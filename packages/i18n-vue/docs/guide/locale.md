# Choosing the locale

Three functions, from `@nxgt/i18n-vue` or `@nxgt/i18n-vue/core`. None of
them reads a request; you pass what you have.

## `pickLocale(wanted, supported, fallback)`

The first wanted locale you support, or `fallback`:

```ts
import { pickLocale } from '@nxgt/i18n-vue';

pickLocale(['de', 'fr', 'en'], ['en', 'fr'], 'en'); // 'fr'
pickLocale('fr-CA', ['en', 'fr'], 'en'); // 'fr'   — the language alone
pickLocale('fr_CA', ['en', 'fr'], 'en'); // 'fr'   — _ or -, either
pickLocale('pt', ['en', 'pt-BR'], 'en'); // 'pt-BR' — the only Portuguese
pickLocale('PT-br', ['en', 'pt-BR'], 'en'); // 'pt-BR' — answered as you spell it
pickLocale(null, ['en', 'fr'], 'en'); // 'en'
```

For each wanted locale in order: an exact match wins, then a match on the
language alone. So the order of `wanted` is the order of preference —
`['fr-CH', 'en']` answers `fr` even though `en` is an exact match, because
French was asked for first.

`wanted` is a string, `null`, `undefined`, or a list of them; an empty or
missing entry is skipped. Typically: a stored preference first, then the
visitor's languages.

`supported` empty, or not holding `fallback`, is a wiring mistake: a
`TypeError`. With `as const` or a literal list, the answer is typed as one of
them:

```ts
const locale: 'en' | 'fr' = pickLocale(wanted, ['en', 'fr'], 'en');
```

## `parseAcceptLanguage(header)`

The locales of an `Accept-Language` header, most wanted first:

```ts
import { parseAcceptLanguage } from '@nxgt/i18n-vue';

parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8'); // ['fr-CA', 'fr', 'en']
parseAcceptLanguage('en;q=0.5, de, fr;q=0.5'); // ['de', 'en', 'fr']
parseAcceptLanguage('fr;q=0, *, en'); // ['en']
parseAcceptLanguage(null); // []
```

Ordered by `q`, ties keeping the header's order; `q=0` and `*` are dropped.
Feed it to `pickLocale` after the stored preference:

```ts
pickLocale([cookie, ...parseAcceptLanguage(header)], ['en', 'fr'], 'en');
```

## `detectLocale(supported, fallback, options?)`

For a browser app with no server: the stored preference, then the browser's
languages, then `fallback`.

```ts
import { detectLocale } from '@nxgt/i18n-vue';

detectLocale(['en', 'fr'], 'en');
// pickLocale([localStorage.language, ...navigator.languages], ['en', 'fr'], 'en')

detectLocale(['en', 'fr'], 'en', { storageKey: 'lang' }); // another key
detectLocale(['en', 'fr'], 'en', { storageKey: false }); // no stored preference
```

The default key, `'language'`, is `@nxgt/i18n`'s `LANGUAGE_KEY`. Storage that
throws when read (a sandboxed frame, a privacy mode) counts as no preference.
Outside a browser — no `navigator`, no `localStorage` — it answers `fallback`.

Do not use it for a server-rendered page: the server cannot see
`localStorage`, so the browser would pick another locale than the server
rendered in. Resolve the locale on the server from a cookie and
`Accept-Language`, as the [Nuxt module](nuxt.md) does.
