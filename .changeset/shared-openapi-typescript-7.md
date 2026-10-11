---
"@nxgt/shared-openapi": minor
---

Importing `@nxgt/shared-openapi` no longer throws where `typescript` resolves to TypeScript 7. The package loaded `openapi-typescript`, `@hey-api/openapi-ts` and `typescript` at module scope, and all three need TypeScript's compiler API, which TypeScript 7 does not ship; they are now loaded when `generateOpenapiTS` or `defineHeyApiConfig` is called. Under TypeScript 6 nothing changes. Under TypeScript 7 the package imports, and both helpers reject with an error naming the TypeScript found and the fix: run the codegen where `typescript` resolves to `^6.0.3`. The `typescript` peer range is unchanged here.
