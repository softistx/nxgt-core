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
	getFallbackLanguage,
	SUPPORTED_LANGUAGES,
	LANGUAGE_KEY,
} from '@nxgt/i18n';

translate('errors.not-found');

const t = createTranslator(myCatalogues, getLanguage);
t('users.greeting', { name });
```

`translate` reads this package's catalogues (`en` and `fr`, under `errors`,
`common`, `validation`, `zod`) and every catalogue registered on top of them
(see below). Pass your own catalogues to `createTranslator` when a service has
messages this package does not. A key the language lacks, or a language with no
catalogue at all, is looked up in the fallback language. Only when that misses
too does the translator answer the key itself, never a throw.

`LocaleKey` is `keyof` the flattened English catalogue — that is the type
`CustomException.message` uses. `Language` is `string` since 3.0, and
`BuiltInLanguage` is `'en' | 'fr'`, the languages this package ships.
`resources`, `en` and `fr` are the package's catalogues themselves, never
changed by a registration. Shared keys include `errors.not-found`,
`errors.unauthenticated`, `errors.insufficient-permissions` and
`errors.service-unavailable`.

## Adding a language, overriding a message

A language is data an app registers, not a list this package fixes:

```ts
import { registerCatalogue, setFallbackLanguage } from '@nxgt/i18n';

registerCatalogue('de', await loadCatalogue('de')); // from a file, a database…
registerCatalogue('fr', { errors: { 'not-found': 'Introuvable' } });
setFallbackLanguage('fr');
```

- `registerCatalogue(language, catalogue)` merges `catalogue` deeply over what
  that language already has. A key it names wins; a key it leaves out keeps the
  package's message. A new language becomes supported: it joins
  `SUPPORTED_LANGUAGES`, `getLanguage()` accepts it from a source or
  `localStorage`, and `translate` answers in it. Registering the same language
  again merges again; nothing is removed.
- `registerCatalogue(language, catalogue, { replace: true })` drops what was
  registered for that language before, then registers `catalogue`. A reload
  from a database uses it, so a key retired since the last load disappears.
  It drops every earlier registration for that language, whichever module
  made it. The package's own messages stay underneath either way. The options
  are typed `RegisterCatalogueOptions`.
- `setFallbackLanguage(language)` changes what `getLanguage()` answers when
  nothing names a language (`'en'` until then). The language must have a
  catalogue; otherwise it throws a `RangeError`, so register a new language
  first. `getFallbackLanguage()` reads it.
- `registeredCatalogues()` answers the catalogues `translate` reads, by
  language.

The state lives on `globalThis`, as the language sources do: two 3.x copies of
this package in one app share it, and the keys a newer copy ships reach both.
A 2.x copy shares the language sources but not the catalogues: it refuses a
language it does not ship and answers in English. Every `@nxgt/*` package an
app uses has to resolve `@nxgt/i18n` 3 before its registrations reach it.

A language registered with only the app's keys has none of the package's
`errors`, `validation` and `zod` messages, and `translate` answers those in the
fallback language. Register them in that language too to have them translated.

### `mergeCatalogues`

`mergeCatalogues(base, ...overrides)` is the merge `registerCatalogue` uses,
for an app that builds its catalogues itself:

```ts
import { mergeCatalogues, resources } from '@nxgt/i18n';

export const en = mergeCatalogues(resources.en, appEn, overridesFromTheDatabase.en);
```

A spread replaces whole branches: `{ ...resources.en, validation }` drops every
package key under `validation` that the app did not repeat. `mergeCatalogues`
merges a branch key by key, and the last override wins leaf by leaf. A leaf
replaces a branch, and the other way round. `undefined` and `null` are
skipped, so an override never erases a message. The inputs are not changed,
and a `__proto__` key is ignored. The result is typed as `base`; keys an
override adds are not in that type.

### Checking a message: `parseMessage`

`parseMessage(message)` parses an ICU message the way `translate` formats it,
and answers the arguments it uses, with their kinds:

```ts
import { MessageSyntaxError, parseMessage } from '@nxgt/i18n';

parseMessage('{n, plural, one {# file by {who}} other {# files}}');
// [{ name: 'n', kind: 'plural' }, { name: 'who', kind: 'argument' }]

try {
	parseMessage('Hello {name');
} catch (error) {
	if (error instanceof MessageSyntaxError) {
		error.code; // 'EXPECT_ARGUMENT_CLOSING_BRACE'
		error.line; error.column; // 1, 7
	}
}
```

- Each `{ name, kind }` pair is listed once, in the order it first appears,
  including inside plural and select branches and tags. A name used two ways,
  such as `{n}` and `{n, number}`, appears twice, which is how a check finds it.
  The result is a `MessageArgument[]`, and `kind` is an `ArgumentKind`.
- The kinds are `argument`, `number`, `date`, `time`, `select`, `plural`,
  `selectordinal` and `tag`. A tag such as `<b>…</b>` is formatted by a
  function the caller passes under that name.
- A message that does not parse throws a `MessageSyntaxError`, a
  `SyntaxError` carrying the parser's `code`, the `source`, and the `offset`,
  `line` and `column` where parsing failed. A plural or select without an
  `other` branch is refused, as the formatter refuses it. A skeleton the
  parser locates keeps its own code (`INVALID_NUMBER_SKELETON`,
  `EXPECT_DATE_TIME_SKELETON`). One it refuses without saying where, such as
  `{d, date, ::YYYY}`, has the code `INVALID_SKELETON` and no position. `cause`
  is the parser's own error.

Use it to check a catalogue loaded from a database, at load time or in a spec:
every message parses, keeps to the ICU subset the app allows, and uses each
argument with the same kind in every language. `translate` itself never
throws: a message that does not parse is logged and returned as it is.

## Where the language comes from

`getLanguage()` asks, most specific first:

1. every registered **language source**, in the order registered
2. `localStorage.language`, when that object exists
3. the fallback language: `'en'`, or what `setFallbackLanguage()` set

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

A server knows the language from its request, and a browser keeps it in
`localStorage`. Asking both serves either without a caller changing anything.
Pass a provider (a function or a language name) to `createTranslator` if you
want one source and not the other.

`SUPPORTED_LANGUAGES` is derived from the registered catalogues, not typed out,
and it is live: a registration shows in it.

### Since 3.0

- `Language` is `string`, no longer `'en' | 'fr'`; that union is
  `BuiltInLanguage`. Code that narrowed `getLanguage()` to the union now
  narrows it itself, for example with `SUPPORTED_LANGUAGES.includes()`.
- `FALLBACK_LANGUAGE` is removed. Read `getFallbackLanguage()`, and change it
  with `setFallbackLanguage()`.
- `SUPPORTED_LANGUAGES` is a `readonly string[]` that grows when a language is
  registered.
- A key the language lacks is looked up in the fallback language before the
  key itself is answered. Until 3.0, the key itself was answered right away.

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
- **Registering throws on bad input, at startup rather than per request.**
  `registerCatalogue('', …)`, `registerCatalogue('__proto__', …)` and a
  catalogue that is not an object throw a `TypeError`, and so does
  `mergeCatalogues(null, …)`. `setFallbackLanguage()` for a language with no
  catalogue throws a `RangeError`.
