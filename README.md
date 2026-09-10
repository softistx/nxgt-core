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
| `@nxgt/datasource-rest` | Typed REST datasource over `openapi-fetch` |

Each package's `README.md` is its page on npmjs: what it is, which subpaths it
exports, and what will bite a consumer.

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
