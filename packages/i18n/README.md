# @nxgt/i18n

Message catalogues and ICU formatting (`intl-messageformat`) for every service,
plus the `LocaleKey` type that `@nxgt/shared-exceptions` uses to type the
message of a thrown error.

An error message is a **key**, not a sentence: `CustomException` carries
`'users.errors.not-found'` and the boundary that renders it decides the
language. That is why `LocaleKey` lives this low in the layering.

```ts
import { createTranslator, getLanguage, translate } from '@nxgt/i18n';

translate('errors.not-found');
createTranslator(myCatalogues, getLanguage)('users.greeting', { name });
```

`translate` is the shared catalogues (`en` and `fr`). Pass your own catalogues
to `createTranslator` when a service has messages this package does not.

## Where the language comes from

`getLanguage()` asks, most specific first:

1. the Hono request context (`language`)
2. `localStorage.language`, when that object exists
3. `'en'`

The two consuming monorepos had forked exactly this — one read the request, the
other read `localStorage` — and neither could run where the other did. Asking
both serves either without a caller changing anything. Pass a provider to
`createTranslator` if you want one source and not the other.

## Install

```bash
bun add @nxgt/i18n
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
