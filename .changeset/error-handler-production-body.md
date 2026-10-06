---
"@nxgt/shared-hono": patch
---

`createErrorHandler()` no longer sends `debugMessage` under `NODE_ENV=production`: the body carries only `status`, the translated `message` and `timestamp`, whatever was thrown. The exception's `debugMessage` and the stack go to the logger instead, which under production now logs both whatever `showStackInDev` and `showStackInTest` say. Development and test answer as before.

Security: an error response in production no longer includes internal error detail. A client that read `debugMessage` from a production response should read `status` and `message`.
