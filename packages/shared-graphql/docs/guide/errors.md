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

## What a client receives

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

## An outage is a 503, never a denial

Kratos, Hydra or Keto failing to answer is not "anonymous" and not "denied".
Answering it as either would lock every caller out in silence — or, for a
check that defaulted open, let everyone in. So `OryUnavailable` is never caught
as a refusal anywhere in this package, and both functions answer it
`SERVICE_UNAVAILABLE` 503, which a client can retry.

It is recognised by class, and also by its name and shape: an install that
ends up with two copies of `@nxgt/ory-sdk` throws an `OryUnavailable` whose
class is not the one this package imported, and that must still be a 503
rather than a masked 500. `isOryUnavailable(error)` is the test, exported.

## Internal messages stay internal

graphql-js wraps every error a resolver throws in a `GraphQLError`. A wrapper
around a plain `Error` — a driver's `connect ECONNREFUSED 10.0.0.5:27017` — is
replaced by the mask message, as Yoga's default mask does; its `path` is kept.
In development (`isDev`) the original is in `extensions.debugMessage`.

A `GraphQLError` you throw yourself, and every validation error, passes as is.
