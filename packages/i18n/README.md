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
