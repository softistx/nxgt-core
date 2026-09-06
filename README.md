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

Both monorepos install from GitHub Packages. The scope is configured in each
consumer's `.npmrc`:

```
@nxgt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_TOKEN}
```

The packages are private, so `GH_TOKEN` must be set — to install, not just to
publish.

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
