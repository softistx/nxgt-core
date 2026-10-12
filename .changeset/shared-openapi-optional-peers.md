---
"@nxgt/shared-openapi": patch
---

`@hey-api/openapi-ts` and `openapi-typescript` are optional peers. Installing `@nxgt/shared-openapi` next to TypeScript 6 or 7 with npm failed with `ERESOLVE`, because `openapi-typescript` declares `typescript ^5.x`, even for a consumer that only `$ref`s the YAML. Only a consumer that generates clients installs them now. Both are already loaded only when a codegen helper is called.
