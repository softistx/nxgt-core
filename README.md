# nxgt-core

The shared `@nxgt/*` packages, in one place, published to the **public npm
registry**.

These packages used to live twice — once in `sellix-monorepo/packages/` and
once in `nxgt-federation/packages/` — as forks under the same names. A fix made
on one side was re-made by hand on the other, or never made at all. This
repository is the single copy.

## Packages

| Package | What it is |
| --- | --- |
| `@nxgt/shared-logging` | Winston logger, Hono request logging |
| `@nxgt/shared-openapi` | Shared OpenAPI 3.2 components and codegen |
| `@nxgt/i18n` | Message catalogues, ICU formatting, `LocaleKey` |
| `@nxgt/shared` | Domain types, the two principal shapes, helpers |
| `@nxgt/shared-exceptions` | `CustomException` and `ErrorCode` |
| `@nxgt/shared-mongo` | Mongoose, CRUD, migrations, audit, pagination |
| `@nxgt/shared-storage` | MinIO / S3 and GridFS |
| `@nxgt/shared-events` | Event payloads and BullMQ queue plumbing |
| `@nxgt/shared-hono` | Hono app factory, auth, `openapi-fetch`, MCP |
| `@nxgt/shared-graphql` | Yoga / federation, shared SDL, `@check` |
| `@nxgt/security` | Policy engine — REST and GraphQL evaluators |

Each package's `README.md` is its page on npmjs: what it is, which subpaths it
exports, how to use it, and what will bite a consumer. Read that page, not
this table, before importing.

## Layering

```
shared-logging   shared-openapi   shared-events   i18n   (no internal dependencies)

package             depends on
shared-exceptions   i18n
shared              shared-logging, shared-events
shared-mongo        shared, shared-exceptions, i18n, shared-logging
security            shared, shared-exceptions, shared-logging
shared-storage      shared-mongo, shared, shared-exceptions, i18n, shared-logging
shared-hono         shared-mongo, security, shared, shared-exceptions, i18n, shared-logging
shared-graphql      shared-mongo, security, shared, shared-exceptions, i18n, shared-logging
```

Each row is a package's direct `@nxgt/*` dependencies, and names only rows
above it. The manifests are the source of truth:
`grep -n '"@nxgt/' packages/*/package.json`.

`shared-graphql` sits with the application layer.
`@nxgt/openapi-codegen` and `@nxgt/datasource-rest` moved to
[softistx/nxgt-http](https://github.com/softistx/nxgt-http) on 2026-09-14,
with their history, next to the HTTP client and the Hono runtime the
generated code binds to. There are no cycles and there must not be one.

## Consuming them

A consumer needs nothing at all — no `.npmrc`, no token, no registry
configuration:

```bash
bun add @nxgt/shared-mongo
```

That is deliberate. GitHub Packages demands a token even for public packages,
which would mean a secret threaded through every CI job and every Docker build
in both monorepos. Publishing here needs a token; reading never does.

`stx-sdk`, `@nxgt/material` and `@nxgt/map` live in their own repositories and
are also public on npmjs. They are not packages of this repo. `@nxgt/material`
vendors Font Awesome Pro; treat the licence as load-bearing even though the
tarball is public.

## Working on a package

```bash
bun install
bun run build        # every package; `exports` points at dist/
bun run typecheck
bun run test         # one process per package, never `bun test` from the root
```

To try a change from a consuming repo without publishing, build the package and
`bun link` it there. See `AGENTS.md` for the loop and its traps.

## Releasing

Changesets, independent versions per package:

```bash
bun changeset        # describe the change, pick the bump
```

Merging to `develop` opens a "Version Packages" pull request; merging *that*
publishes to npmjs.

## License

[MIT](LICENSE), for every package.
