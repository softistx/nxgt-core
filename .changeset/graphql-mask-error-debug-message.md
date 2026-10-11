---
"@nxgt/shared-graphql": patch
---

`createMaskError` no longer sends a `CustomException`'s `debugMessage` to the client unless Yoga's `isDev` is on: in production (`isDev` false) the answer carries the code, the status and the translated message only, as `createFormatError` does. An outage's `debugMessage` follows the same rule, and `useOryAuth`, which throws it during context building where Yoga does not call `maskError`, adds it only when `NODE_ENV` is `development`. Yoga does not derive `isDev` from `NODE_ENV` for a custom `maskError`: pass `maskedErrors: { maskError, isDev: process.env.NODE_ENV === 'development' }` to get `debugMessage` in development.
