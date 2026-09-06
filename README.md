# nxgt-core

The shared `@nxgt/*` packages, in one place, published to GitHub Packages.

These packages used to live twice — once in `sellix-monorepo/packages/` and
once in `nxgt-federation/packages/` — as forks under the same names. A fix made
on one side was re-made by hand on the other, or never made at all. This
repository is the single copy.

## Packages

| Package | What it is |
| --- | --- |
| `@nxgt/i18n` | Translation resources and `createTranslator` |
| `@nxgt/shared-logging` | The winston logger, its Hono middleware and context |
| `@nxgt/shared-exceptions` | `CustomException` and validation helpers |
| `@nxgt/shared` | Cross-cutting helpers, models and caching |
| `@nxgt/shared-mongo` | Mongoose plugins, the CRUD service, migrations, audit |
| `@nxgt/shared-storage` | S3 / MinIO / GridFS storage services |
| `@nxgt/shared-hono` | Hono middlewares, `openapi-fetch`, env |
| `@nxgt/security` | The policy engine — rules, REST and GraphQL evaluators |
| `@nxgt/shared-openapi` | OpenAPI generation helpers |

## Consuming them

They are published to the **public npm registry**, so a consumer needs nothing
at all — no `.npmrc`, no token, no registry configuration:

```bash
bun add @nxgt/shared-mongo
```

That is deliberate. GitHub Packages demands a token even for public packages,
which would mean a secret threaded through every CI job and every Docker build
in both monorepos. Publishing here needs a token; reading never does.

`@nxgt/material`, `@nxgt/map` and `stx-sdk` are a different story — they are
private and consumed through `link:`, and they are not published anywhere.

## Working on a package

```bash
bun install
bun run build        # every package
bun run typecheck
bun test
```

To try a change from a consuming repo without publishing, build the package and
`bun link` it there. See `AGENTS.md` for the loop and its traps.

## Releasing

Changesets, independent versions per package:

```bash
bun changeset        # describe the change, pick the bump
```

Merging to `develop` opens a "Version Packages" pull request; merging *that*
publishes.
