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
default output. It returns a `Promise<UserConfig>`, as `defineConfig` does,
and since 2.1.0 loads `@hey-api/openapi-ts` only when called; `openapi-ts`
accepts a promise as a config file's default export, so
`export default defineHeyApiConfig(...)` works as before.

## TypeScript 6 and 7

Both helpers drive TypeScript's compiler API, through `openapi-typescript` and
`@hey-api/openapi-ts`. TypeScript 7's npm package ships no compiler API — its
default export holds `version` and nothing else — and both tools read the API
the moment they are imported. So this package loads them, and `typescript`,
only when a helper is called:

- **Importing `@nxgt/shared-openapi` works under TypeScript 6 and 7.** The
  YAML in `openapi/` needs no TypeScript at all.
- **Running a helper needs TypeScript 6.** Where `typescript` resolves to 7,
  `generateOpenapiTS` and `defineHeyApiConfig` reject with:

  ```
  generateOpenapiTS needs TypeScript's compiler API, which TypeScript 7 does not ship, and `typescript` resolves to TypeScript 7.0.2. openapi-typescript and @hey-api/openapi-ts need it too. Run the codegen where `typescript` resolves to 6: install typescript@^6.0.3 there.
  ```

  Run the codegen from a package whose `typescript` is 6:

  ```bash
  bun add -d typescript@^6.0.3
  ```

Before 2.1.0, importing the package under TypeScript 7 threw at once, with
`undefined is not an object (evaluating 'ts.factory.createKeywordTypeNode')`
(Bun) or `Cannot read properties of undefined (reading 'createKeywordTypeNode')`
(Node), raised inside `openapi-typescript`. Upgrade, then follow the message
above.

## There is no sort vocabulary here, on purpose

`SearchRequest` carries `filter` and nothing else. It used to carry `sort`, and
`SortField` / `SortOrder` / `SortDirection` shipped alongside it — so every
service that `$ref`ed the generic search body advertised sorting it could not
perform. The paginator these bodies feed, `Model.cursorPaginate` in
`@nxgt/shared-mongo`, orders by `_id` and reads no `sort` at all: the cursor
*is* the `_id`, so a second sort key would have to be part of the cursor.
Every endpoint that took the generic search body accepted the parameter and
discarded it.

Add the schemas back the day a paginator honours them — with compound cursors,
next to the code that reads them. Not before.

## Things that bite

- **A published schema is a promise.** Adding a field to a shared fragment
  without following it to the code that consumes it is how `sort` shipped.
- **The `$ref` depth is the consumer's.** Isolated linker, no hoist, count
  from the file that contains the `$ref`.
