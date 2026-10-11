---
"@nxgt/shared-hono": patch
---

`createErrorHandler()` no longer sends `debugMessage` under `NODE_ENV=production`: the body carries only `status`, `message` (translated, or an `HTTPException`'s own) and `timestamp`, whatever `Error` was thrown. The exception's `debugMessage` and the stack go to the logger instead, which under production now logs both whatever `showStackInDev` and `showStackInTest` say. Development and test answer as before.

Security: an error response in production no longer includes internal error detail. A client that read `debugMessage` from a production response should read `status` and `message`.
