---
'@nxgt/shared-mongo': patch
---

The published declarations no longer import packages the manifest does not declare. `AUDIT_CHANGE_STREAM` is typed `mongo.ChangeStream` through `mongoose` instead of inferring `import("mongodb").ChangeStream`, and `requireById`'s `errorProps` takes `StatusCode` from `@nxgt/shared-exceptions` instead of `hono/utils/http-status`. A consumer without `hono` or `mongodb` hoisted no longer resolves either to `any`.
