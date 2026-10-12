---
"@nxgt/shared-openapi": patch
---

`generateOpenapiTS` and `defineHeyApiConfig` name the optional peer they need when it is not installed (`openapi-typescript`, `@hey-api/openapi-ts`) and how to install it, instead of the runtime's bare `Cannot find package`. The original error is kept as `cause`.
