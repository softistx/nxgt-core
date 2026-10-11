---
"@nxgt/shared-hono": minor
---

`createErrorHandler()` is now secure by default: it sends `debugMessage` (a `CustomException`'s own, an `HTTPException`'s stack, or an `Error`'s message) only when the raw `NODE_ENV` is explicitly `development` or `test`. Under `production`, any other value, or an **unset** `NODE_ENV`, the body carries only `status`, `message` (translated, or an `HTTPException`'s own) and `timestamp`. The detail and the stack go to the logger instead, which logs both whatever `showStackInDev` and `showStackInTest` say.

Behaviour change: an unset `NODE_ENV` used to count as `development` and answered the detail, so a service deployed without `NODE_ENV` leaked it. It no longer does. A local developer who wants the detail must set `NODE_ENV=development` (or `test`) for the run. `env.NODE_ENV` and its `development` default are unchanged, so `oryAuth`'s mock-header gate behaves as before; the handler reads the raw value (new `rawEnv` in `env`).

Security: an error response outside development and test no longer includes internal error detail. A client that read `debugMessage` from such a response should read `status` and `message`.
