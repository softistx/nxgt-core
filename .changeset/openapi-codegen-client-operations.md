---
'@nxgt/openapi-codegen': minor
---

`types.ts` now declares `ClientOperations`: for each operation, the `args` a client call takes (its parameters and body as the caller writes them, optional when nothing is required) and every declared `reply` as `{ status, type, data }`, decoded, with `wire` as JSON carries it. `@nxgt/openapi-client` reads it; a schema named `ClientOperations` is now a `name_collision`.
