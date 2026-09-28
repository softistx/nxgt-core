# Errors: `createMaskError` and `createFormatError`

The directives, `requireUser` and `can` throw a **denial**: a `GraphQLError`
that carries its own code and HTTP status, so any server answers it right.
Services throw `CustomException` (from `@nxgt/shared-exceptions`), and
`@nxgt/ory-sdk` throws `OryUnavailable` when Ory cannot answer. Neither of
those is a `GraphQLError`, so a server has to be told how to answer them —
and how to translate a denial's message with your resources. These two
functions do it — one for Yoga, one for Apollo Server.

## Denials

```ts
import { denial } from '@nxgt/shared-graphql';
import { ErrorCode } from '@nxgt/shared-exceptions';

throw denial(ErrorCode.NotFound, 'notes.errors.not-found');
```

| Code | `extensions.http.status` | Thrown by |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | `@permission`, `@authenticated`, `requireUser`, `can`, with no caller |
| `FORBIDDEN` | 403 | `@permission(onDeny: FORBIDDEN)`; `@authenticated(type:)` for a caller of another type |
| `NOT_FOUND` | 404 | `@permission`, by default |

The second argument is an i18n key — `errors.unauthenticated`,
`errors.insufficient-permissions` or `errors.not-found` when omitted. The
message is that key translated with `@nxgt/i18n`'s own resources, in the
request's language when one is known; a key those resources do not hold stays
as it is. `createMaskError(translate)` and `createFormatError(translate)`
translate it again with yours, and keep its code and status.

`denialMessageKey(error)` returns that key, for a mask of your own; the key is
never serialised to the client.

**Without `createMaskError`**, Yoga answers a denial with its status — it is
a `GraphQLError` thrown on purpose, which Yoga's default mask lets through.

## Yoga

```ts
import { createMaskError } from '@nxgt/shared-graphql';
import { translate } from './i18n';

createYoga({ maskedErrors: { maskError: createMaskError(translate) } });
```

## Apollo Server

```ts
import { createFormatError } from '@nxgt/shared-graphql';

new ApolloServer({ formatError: createFormatError(translate, isProduction) });
```

## What a client receives — Yoga, through `createMaskError`

| Thrown | `extensions.code` | `extensions.http.status` | message |
| --- | --- | --- | --- |
| a `denial()` | its code | 401, 403 or 404 | its key, translated with your `translate` |
| `CustomException.unauthenticated()` | `UNAUTHENTICATED` | 401 | translated key |
| `CustomException.forbidden()` | `FORBIDDEN` | 403 | translated key |
| `CustomException.notFound()` | `NOT_FOUND` | 404 | translated key |
| any other `CustomException` | its `errorCode` | its status | translated key |
| a Mongoose error | through `castError` | its status | translated key |
| `OryUnavailable` | `SERVICE_UNAVAILABLE` | 503 | `ory: keto is unavailable` |
| a `GraphQLError` thrown on purpose | its own | its own | its own |
| a plain `Error` a resolver threw | `INTERNAL_SERVER_ERROR` | — | the mask message |

```json
{
	"errors": [
		{
			"message": "Could not find the requested resource.",
			"path": ["note"],
			"extensions": { "code": "NOT_FOUND", "http": { "status": 404 } }
		}
	]
}
```

The HTTP status applies when it is the only error of the response, as Yoga
decides it.

## What a client receives — Apollo, through `createFormatError`

| Thrown | `extensions.code` | message |
| --- | --- | --- |
| a `denial()` | its code (`http.status` answers the transport) | its key, translated with your `translate` |
| a `CustomException` or a Mongoose error | its `errorCode` (plus `debugMessage`) | translated key |
| `OryUnavailable` | `SERVICE_UNAVAILABLE`, `http: { status: 503 }` in `extensions` | `ory: keto is unavailable` |
| an Apollo validation or parse error | its own | translated `errors.<code>` |
| anything else | as Apollo formats it | as Apollo formats it — not masked here |

`formatError` shapes the error body; it does not set the response's status,
so `http.status` is information for the client, not the transport's answer.
The stack trace is removed when the second argument, `production`, is true.

## An outage is a 503, never a denial

Kratos, Hydra or Keto failing to answer is not "anonymous" and not "denied".
Answering it as either would lock every caller out in silence — or, for a
check that defaulted open, let everyone in. So `OryUnavailable` is never caught
as a refusal anywhere in this package, and both functions answer it
`SERVICE_UNAVAILABLE` — with HTTP 503 under Yoga — which a client can retry.

It is recognised by class, and also by its name and shape: an install that
ends up with two copies of `@nxgt/ory-sdk` throws an `OryUnavailable` whose
class is not the one this package imported, and that must still be a 503
rather than a masked 500. `isOryUnavailable(error)` is the test, and
`serviceUnavailableError(error)` builds the 503 `GraphQLError` both use —
exported for a server that writes its own `maskError`:

```ts
import { isOryUnavailable, serviceUnavailableError } from '@nxgt/shared-graphql';
import { GraphQLError } from 'graphql';
import type { MaskError } from 'graphql-yoga';

const maskError: MaskError = (error, message) => {
	const original = error instanceof GraphQLError ? error.originalError : error;
	if (isOryUnavailable(original)) return serviceUnavailableError(original);
	// …
};
```

`oryUnavailableError`, which `useOryAuth` throws when it cannot resolve the
caller, is the same function under its older name.

## Internal messages stay internal

graphql-js wraps every error a resolver throws in a `GraphQLError`. A wrapper
around a plain `Error` — a driver's `connect ECONNREFUSED 10.0.0.5:27017` — is
replaced by the mask message, as Yoga's default mask does; its `path` is kept.
In development (`isDev`) the original is in `extensions.debugMessage`.

A `GraphQLError` you throw yourself, and every validation error, passes as is.
