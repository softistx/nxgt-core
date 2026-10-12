# Troubleshooting `@nxgt/shared-openapi`

Each entry is headed by the message you see, then says when it happens, why,
and the fix. Importing the package never throws; the errors below are raised
when `generateOpenapiTS` or `defineHeyApiConfig` is called. `<helper>` is the
name of the one you called.

## ``<helper> needs `typescript`, which is not installed. Install typescript@^6.0.3 where the codegen runs.``

**When:** a helper is called in a project where `typescript` cannot be
resolved.
**Why:** both helpers drive TypeScript's compiler API through
`openapi-typescript` and `@hey-api/openapi-ts`, and `typescript` is a peer.
**Fix:**

```bash
bun add -d typescript@^6.0.3
```

## ``<helper> needs TypeScript's compiler API, which TypeScript 7 does not ship, and `typescript` resolves to TypeScript 7.0.2…``

The rest: ``openapi-typescript and @hey-api/openapi-ts need it too. Run the codegen where `typescript` resolves to 6: install typescript@^6.0.3 there.``

**When:** a helper is called where `typescript` resolves to 7 (the version
shown in the message is the one found). The original error is in `cause`.
**Why:** TypeScript 7's npm package ships no compiler API, and the two tools
read it as soon as they are imported. The package itself imports fine under 7;
only running a helper needs 6.
**Fix:** run the codegen from a package whose `typescript` is 6:

```bash
bun add -d typescript@^6.0.3
```

### `undefined is not an object (evaluating 'ts.factory.createKeywordTypeNode')`

Node: `Cannot read properties of undefined (reading 'createKeywordTypeNode')`.

**When:** importing the package under TypeScript 7, on versions before 2.1.0.
**Why:** the tools were loaded at import.
**Fix:** upgrade to 2.1.0 or later, then follow the entry above.

## ``<helper> needs `<pkg>`, an optional peer of @nxgt/shared-openapi that only a consumer generating clients installs. Install it where the codegen runs: bun add -d <pkg>``

**When:** a helper is called and `openapi-typescript` (for
`generateOpenapiTS`) or `@hey-api/openapi-ts` (for `defineHeyApiConfig`) is
not installed. The runtime's own error is in `cause`.
**Why:** both are optional peers; a consumer that only `$ref`s the YAML never
needs them.
**Fix:**

```bash
bun add -d @hey-api/openapi-ts openapi-typescript
```

## npm `ERESOLVE` on `openapi-typescript`

**When:** `npm install openapi-typescript` next to TypeScript 6 or 7 fails
with a peer-dependency conflict.
**Why:** `openapi-typescript` declares `typescript` `^5.x` as its own peer.
Bun installs it as it is; npm refuses.
**Fix:** tell npm, with the flag below or an `overrides` entry for that peer:

```bash
npm install -D openapi-typescript --legacy-peer-deps
```

## An `@redocly/openapi-core` rejection of the OpenAPI 3.2 version line

**When:** a linter or bundler built on `@redocly/openapi-core` reads the
specs.
**Why:** the fragments are OpenAPI 3.2, and `@redocly/openapi-core` below
1.34.19 rejects the version line outright.
**Fix:** update `@redocly/openapi-core` to 1.34.19 or later.

## A `$ref` into `node_modules` that does not resolve

**When:** bundling a spec that references `openapi/components/…`.
**Why:** Bun's isolated linker does not hoist, so the path is counted from
the file that contains the `$ref`, up to your app's own `node_modules`.
**Fix:**

```yaml
$ref: ../../../node_modules/@nxgt/shared-openapi/openapi/components/parameters/before.yaml
```
