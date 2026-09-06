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

`@hey-api/openapi-ts` and `openapi-typescript` are peers — only a consumer that
actually generates clients needs them.

## Install

```bash
bun add @nxgt/shared-openapi
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
