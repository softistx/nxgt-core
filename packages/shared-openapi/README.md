# @nxgt/shared-openapi

The OpenAPI components every service `$ref`s — parameters, responses, schemas,
security schemes — plus the codegen plugin that turns a bundled spec into typed
clients.

## The YAML ships in `openapi/`

Reference it out of `node_modules`, at a depth relative to **your app's own
root**, because Bun's isolated linker does not hoist:

```yaml
$ref: ../../../node_modules/@nxgt/shared-openapi/openapi/components/parameters/before.yaml
```

The specs are **OpenAPI 3.2**: nullability is `type: [string, "null"]`, not the
3.0 `nullable: true`. `@redocly/openapi-core` below 1.34.19 rejects the version
line outright.

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

`@hey-api/openapi-ts` and `openapi-typescript` are peers — only a consumer that
actually generates clients needs them.

## Install

```bash
bun add @nxgt/shared-openapi
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
