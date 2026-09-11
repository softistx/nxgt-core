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

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

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

`LocaleKey` is `keyof` the flattened English catalogue. `Language` is
`'en' | 'fr'`.

## Where the language comes from

`getLanguage()` asks, most specific first:

1. the Hono request context (`LANGUAGE_KEY`, `'language'`)
2. `localStorage.language`, when that object exists
3. `FALLBACK_LANGUAGE` (`'en'`)

The two consuming monorepos had forked exactly this — one read the request, the
other read `localStorage` — and neither could run where the other did. Asking
both serves either without a caller changing anything. Pass a provider (a
function or a `Language` literal) to `createTranslator` if you want one source
and not the other.

`SUPPORTED_LANGUAGES` is derived from the catalogue keys, not typed out.

## Things that bite

- **Messages are keys.** Rendering at the throw site (or translating in a
  service) freezes the language of whoever threw, not of whoever reads.
- **ICU formatting failures are swallowed** (`console.error`) and the
  unformatted message is returned. A bad `{name}` in a catalogue is a log
  line, not a 500.
