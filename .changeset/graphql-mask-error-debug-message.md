---
"@nxgt/shared-graphql": patch
---

`createMaskError` no longer sends a `CustomException`'s `debugMessage` to the client unless Yoga's `isDev` is on: in production (`isDev` false) the answer carries the code, the status and the translated message only, as `createFormatError` does. An outage's `debugMessage` follows the same rule, and `useOryAuth` throws it during context building as a finished `GraphQLError` with no `originalError`, which any `maskError` passes through unchanged, so it decides where it is thrown and adds it only when `NODE_ENV` is `development`. `serviceUnavailableError(error, debug = false)`, which is public, used to always add `debugMessage`; it now does so only when `debug` is true. Yoga does not derive `isDev` from `NODE_ENV` for a custom `maskError`: pass `maskedErrors: { maskError, isDev: process.env.NODE_ENV === 'development' }` to get `debugMessage` in development.
