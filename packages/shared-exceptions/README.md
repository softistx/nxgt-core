# @nxgt/shared-exceptions

`CustomException` — the error class everything either monorepo throws is built
on — and the `ErrorCode` enum.

## `code` and `errorCode` are not the same field

The two repositories had forked this class and neither behaviour was covered by
a test, so both were kept:

- **`code` is the HTTP status.** `@nxgt/shared-hono`'s error handler does
  `c.status(err.code)` straight off it.
- **`errorCode` is the symbolic `ErrorCode`** (`ErrorCode.NotFound`,
  `ErrorCode.Unauthenticated`, …), which is what a GraphQL error layer surfaces.

They are always in agreement — the constructor derives whichever it was not
given. The constructor accepts both call shapes, positional and object, and
every factory from both sides survives (`CustomException.notFound(…)`,
`.conflict(…)`, `.unauthenticated(…)`, `.validationError(…)`), so no call site
in either repository had to change.

Messages are `LocaleKey`s from `@nxgt/i18n`, not sentences.

## Install

```bash
bun add @nxgt/shared-exceptions
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
