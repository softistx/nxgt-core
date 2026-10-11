---
"@nxgt/shared-graphql": patch
---

`createFormatError(translate, true)` hides internal detail from the client in production: an unexpected error — a plain `Error` a resolver threw, or anything thrown that is not an `Error` — answers `Unexpected error.` with `INTERNAL_SERVER_ERROR`, keeping its `path` and `locations`, as `createMaskError` masks it under Yoga; and no error carries `extensions.debugMessage` or `extensions.stacktrace`. Outside production, what a client receives is unchanged. Security note: an Apollo server that passes `production` should be upgraded, so that no error message meant for the server reaches its clients.

`createFormatError` is now typed as returning the function itself, never `undefined`, so `new ApolloServer({ formatError: createFormatError(...) })` compiles under `exactOptionalPropertyTypes`.
