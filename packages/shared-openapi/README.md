# @nxgt/shared-openapi

The OpenAPI components every service `$ref`s — parameters, responses, schemas,
security schemes — plus the codegen helpers that turn a bundled spec into typed
clients.

## Install

```bash
bun add @nxgt/shared-openapi
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it. `@hey-api/openapi-ts` and `openapi-typescript` are peers —
only a consumer that actually generates clients needs them.

## The YAML ships in `openapi/`

`bun build` bundles code and nothing else, so the fragments live in
`openapi/components/` (parameters, responses, schemas, security schemes) and
are named in `files`. Reference them out of `node_modules`, at a depth relative
to **your app's own root**, because Bun's isolated linker does not hoist:

```yaml
$ref: ../../../node_modules/@nxgt/shared-openapi/openapi/components/parameters/before.yaml
```

The specs are **OpenAPI 3.2**: nullability is `type: [string, "null"]`, not the
3.0 `nullable: true`. `@redocly/openapi-core` below 1.34.19 rejects the version
line outright.

## Codegen

```ts
import { generateOpenapiTS, defineHeyApiConfig } from '@nxgt/shared-openapi';

await generateOpenapiTS(new URL('./openapi/api-docs.yaml', import.meta.url), {
	outputFolder: './src/generated',
	outputFileName: 'api.d.ts',
});

export default defineHeyApiConfig((config) => ({
	...config,
	input: './openapi/api-docs.yaml',
}));
```

`generateOpenapiTS` wraps `openapi-typescript` and maps `format: date-time` to
`Date` and `format: binary` to `File`. `defineHeyApiConfig` wraps
`@hey-api/openapi-ts` with Zod plugin and `src/generated/openapi-ts` as the
default output.

These helpers evaluate `ts.factory.createTypeReferenceNode(...)` at module
scope. TypeScript 7's default export has no `.factory`, which is why every
`@nxgt/*` package pins `typescript` to `^6.0.3`.

## There is no sort vocabulary here, on purpose

`SearchRequest` carries `filter` and nothing else. It used to carry `sort`, and
`SortField` / `SortOrder` / `SortDirection` shipped alongside it — so every
service that `$ref`ed the generic search body advertised sorting it could not
perform. The paginator these bodies feed, `Model.cursorPaginate` in
`@nxgt/shared-mongo`, orders by `_id` and reads no `sort` at all: the cursor
*is* the `_id`, so a second sort key would have to be part of the cursor.
Twenty-three endpoints across six sellix services accepted the parameter and
discarded it.

Add the schemas back the day a paginator honours them — with compound cursors,
next to the code that reads them. Not before.

## Things that bite

- **A published schema is a promise.** Adding a field to a shared fragment
  without following it to the code that consumes it is how `sort` shipped.
- **The `$ref` depth is the consumer's.** Isolated linker, no hoist, count
  from the file that contains the `$ref`.
