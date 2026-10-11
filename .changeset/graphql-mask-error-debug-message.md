---
"@nxgt/shared-graphql": patch
---

`createMaskError` no longer sends a `CustomException`'s `debugMessage` to the client unless Yoga's `isDev` is on: in production (`isDev` false) the answer carries the code, the status and the translated message only, as `createFormatError` does. Development is unchanged.
