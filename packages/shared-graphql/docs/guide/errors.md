# Errors: `createMaskError` and `createFormatError`

Services throw `CustomException` (from `@nxgt/shared-exceptions`), the
directives throw it for a refusal, and `@nxgt/ory-sdk` throws `OryUnavailable`
when Ory cannot answer. Neither is a `GraphQLError`, so a server has to be told
how to answer them. These two functions do it — one for Yoga, one for Apollo
Server.

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
