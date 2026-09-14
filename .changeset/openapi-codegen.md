---
'@nxgt/openapi-codegen': minor
---

New package: generate TypeScript types, Zod 4 validators, a typed operations table and an openapi-fetch `paths` type from an OpenAPI 3.1 or 3.2 document — one file or split across many, `$ref`s into `node_modules` included. Types and validators come from one model, so they agree. Run `nxgt-openapi generate` (a config file, or `--input`) or call `generate()`. With `hono: true`, `@nxgt/openapi-codegen/hono` gives typed Hono routes that validate requests before your handler runs. `dates: 'date'` decodes date-times to `Date`; `lint` runs Redocly over the spec first. `zod` is a required peer; `hono` and `@redocly/openapi-core` are optional.
