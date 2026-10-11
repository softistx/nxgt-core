# @nxgt/i18n

Message catalogues and ICU formatting (`intl-messageformat`) for every service,
plus the `LocaleKey` type that `@nxgt/shared-exceptions` uses to type the
message of a thrown error.

An error message is a **key**, not a sentence: `CustomException` carries
`'users.errors.not-found'` and the boundary that renders it decides the
language. That is why `LocaleKey` lives this low in the layering.

## Install

```bash
bun add @nxgt/i18n
```

Public on npmjs; no token needed to install. TypeScript is a peer:
`^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set
installs with either.

## Usage

```ts
import {
	createTranslator,
	getLanguage,
	translate,
	FALLBACK_LANGUAGE,
	SUPPORTED_LANGUAGES,
	LANGUAGE_KEY,
} from '@nxgt/i18n';

translate('errors.not-found');

const t = createTranslator(myCatalogues, getLanguage);
t('users.greeting', { name });
```

`translate` is bound to this package's catalogues (`en` and `fr`, under
`errors`, `common`, `validation`, `zod`). Pass your own catalogues to
`createTranslator` when a service has messages this package does not. A missing
key returns the key itself, not a throw.

`LocaleKey` is `keyof` the flattened English catalogue — that is the type
`CustomException.message` uses. `Language` is `'en' | 'fr'`. `resources`,
`en` and `fr` are the catalogues themselves. Shared keys include
`errors.not-found`, `errors.unauthenticated`, `errors.insufficient-permissions`
and `errors.service-unavailable`.

## Where the language comes from

`getLanguage()` asks, most specific first:

1. every registered **language source**, in the order registered
2. `localStorage.language`, when that object exists
3. `FALLBACK_LANGUAGE` (`'en'`)

A source is a function answering the current request's language, or nothing.
This package knows no server; the server says where its request keeps the
language:

```ts
import { registerLanguageSource } from '@nxgt/i18n';

const remove = registerLanguageSource(() => currentRequest()?.language);
```

| server | its source |
| --- | --- |
| Hono | `@nxgt/shared-hono` registers `honoLanguageSource` when imported: the `language` variable `languageDetector()` sets, read through `contextStorage()` |
| GraphQL Yoga on Hono | `@nxgt/shared-graphql`'s `createYogaHono()` registers the same |
| alxia | `@alxia/i18n`'s `createI18n()` registers the request's language |

A source that answers nothing, a language no catalogue has, or throws is
skipped. Registering one twice keeps one. The registry is on `globalThis`, so
two copies of this package in one app — one a dependency of
`@nxgt/shared-hono`, one the app's own — share it.

The two consuming monorepos had forked exactly this — one read the request, the
other read `localStorage` — and neither could run where the other did. Asking
both serves either without a caller changing anything. Pass a provider (a
function or a `Language` literal) to `createTranslator` if you want one source
and not the other.

`SUPPORTED_LANGUAGES` is derived from the catalogue keys, not typed out.

### Since 2.0

Until 2.0, `getLanguage()` read the Hono request context itself, through
`hono/context-storage`: every consumer depended on Hono, and a server on
anything else got the fallback. The Hono part lives in `@nxgt/shared-hono`
now, with the `ContextVariableMap` augmentation that types `c.get('language')`.
An app that imports `@nxgt/shared-hono` sees no difference; one that used
`@nxgt/i18n` beside Hono without it calls `useHonoLanguage()` from
`@nxgt/shared-hono` once, or registers its own source.

## In a browser bundle

Nothing to change: `import { translate } from '@nxgt/i18n'` is the same import
whether the code runs in Node, Bun, or a bundler that resolves the `browser`
export condition (Vite, Nuxt's client build). Since 2.0 nothing in the package
is Node-only, and the `browser` entry is the same code; a client app registers
a source as a server does, or relies on `localStorage`.

## Things that bite

- **A server's language is a registered source.** Without one, every
  request is translated in `localStorage`'s language — none, on a server — or
  the fallback.
- **Messages are keys.** Rendering at the throw site (or translating in a
  service) freezes the language of whoever threw, not of whoever reads.
- **ICU formatting failures are swallowed** (`console.error`) and the
  unformatted message is returned. A bad `{name}` in a catalogue is a log
  line, not a 500.
