# @nxgt/shared-exceptions

`CustomException` — the error class everything either monorepo throws is built
on — the `ErrorCode` enum, and `zErrorHandling` for Hono's Zod validator.

## Install

```bash
bun add @nxgt/shared-exceptions
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

## `code` and `errorCode` are not the same field

The two repositories had forked this class and neither behaviour was covered by
a test, so both were kept:

- **`code` is the HTTP status** (a number). `@nxgt/shared-hono`'s error handler
  does `c.status(err.code)` straight off it, and `c.status` rejects anything
  else.
- **`errorCode` is the symbolic `ErrorCode`** (`ErrorCode.NotFound`,
  `ErrorCode.Unauthenticated`, …), which is what a GraphQL error layer
  surfaces.

They are always in agreement — the constructor derives whichever it was not
given. Give it `404` and you get `ErrorCode.NotFound`; give it
`ErrorCode.NotFound` and you get `404`. Two symbolic codes answer 400
(`BadRequest` and `ValidationError`); a numeric `400` infers `BadRequest`.

The constructor accepts both call shapes, positional and object:

```ts
new CustomException('users.errors.not-found', 404);
new CustomException({ message: 'users.errors.not-found', code: ErrorCode.NotFound });
CustomException.notFound({ message: 'users.errors.not-found' });
```

Every factory from both sides survives, so no call site in either repository
had to change:

| Factory | Status | `ErrorCode` |
| --- | --- | --- |
| `badRequest` | 400 | `BAD_REQUEST` |
| `validationError` | 400 | `VALIDATION_ERROR` |
| `unauthenticated` / `unauthorized` | 401 | `UNAUTHENTICATED` |
| `forbidden` | 403 | `FORBIDDEN` |
| `notFound` | 404 | `NOT_FOUND` |
| `conflict` | 409 | `CONFLICT` |
| `internal` | 500 | `INTERNAL_SERVER_ERROR` |
| `serviceUnavailable` | 503 | `SERVICE_UNAVAILABLE` |

`unauthorized` is sellix's name for `unauthenticated`. `ServiceUnavailable` is
deliberately distinct from `Forbidden` and `NotFound`: an outage must never
read as a denial.

Messages are `LocaleKey`s from `@nxgt/i18n`, not sentences.

## Zod

```ts
import { zValidator } from '@hono/zod-validator';
import { zErrorHandling } from '@nxgt/shared-exceptions';

app.post('/', zValidator('json', Schema, zErrorHandling), handler);
```

A failed parse becomes `CustomException.badRequest` with
`'errors.validation-failed'`, not Zod's own error object.

## Things that bite

- **`code` is a number.** Treating it as `ErrorCode` (a string) and passing it
  to `c.status` is a 500 of its own.
- **Validation is 400, not 422.** That is the status federation's GraphQL
  error layer already answered; changing it would change what its clients see.
