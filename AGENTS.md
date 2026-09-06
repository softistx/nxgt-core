# AGENTS.md

Instructions for any coding agent working in `nxgt-core`.

## What this repository is

The shared `@nxgt/*` packages that `sellix-monorepo` and `nxgt-federation` both
depend on. Until 2026-09-06 each monorepo carried its own copy under
`packages/`, and the copies had forked: `shared-mongo` differed by ~1430 lines,
`shared` by ~260. This repository is the single copy, published to GitHub
Packages.

It currently holds the nine packages extracted from `sellix-monorepo`.
Federation's three that exist nowhere else — `datasource-rest`,
`shared-events`, `shared-graphql` — arrive with the reconciliation of its own
copies.

Nothing here imports application code. The dependency runs one way: apps depend
on these packages, never the reverse.

## Layering

```
shared-logging   shared-openapi        (no internal dependencies)
      └─ i18n
           └─ shared
                ├─ shared-exceptions
                └─ shared-mongo
                     ├─ shared-storage
                     ├─ shared-hono
                     └─ security
```

**There are no cycles and there must not be one.** A published package cannot
depend on a package that depends back on it — the version bump has no fixed
point and changesets cannot order the release. Federation's `shared` ↔
`shared-events` cycle was broken on the way in; do not reintroduce that shape
by "just re-exporting" something from a lower layer.

## The build, and why declarations are the hard part

Every package is built by the one `build.ts` at the root, which each package
invokes as `bun run ../../build.ts`. There is one script rather than one per
package because they differ only in their entry points. It produces two things:

- **JavaScript**, from `Bun.build` with `packages: 'external'`. A library must
  never bundle its dependencies. `mongoose` above all: its model registry is a
  process singleton, and `@nxgt/shared-mongo` re-exports it, so a second copy
  in the graph means models registered against one connection and looked up on
  another.
- **Declarations**, from `tsc --emitDeclarationOnly` against
  `tsconfig.build.json` — which excludes `*.spec.ts`, while `tsconfig.json`
  still typechecks them.

Entry points are declared per package under `nxgt.entrypoints` in its
`package.json`, and each one must have a matching key in `exports`. A consumer
importing `@nxgt/shared/helpers` resolves through that map; adding a subpath
means adding both.

### Nothing emitted declarations before this repository existed

In the monorepos these packages exported `src/index.ts` directly and
`tsconfig.base.json` set `noEmit: true`. Emitting for the first time surfaced
two classes of failure that a `--noEmit` typecheck can never catch:

**TS2883 — "the inferred type cannot be named".** An inferred return type
whose type lives in a nested `node_modules` path gets that path written into
the `.d.ts`, where it does not exist for a consumer. It hit
`createLogger` (winston, reached through `shared-logging/node_modules`) and
four `MinioService` methods (minio's internal type module). The fix is always
an explicit annotation naming the type through something the consumer can
resolve — `@nxgt/shared-logging` exports `Logger` for exactly this, and
`minio.service.ts` names its result types through the public `Client`
(`Awaited<ReturnType<Client['putObject']>>`) rather than duplicating shapes.

**Hand-written `.d.ts` files are copied, not emitted.** `tsc` passes them
through untouched, so an ambient module augmentation would never reach `dist/`
and the type it declares would silently vanish for every consumer —
`shared-mongo`'s `types/pagination.d.ts`, which declares `Model.paginate`, is
the one that matters most. `build.ts` copies them, and **fails** if a copy
would overwrite something `tsc` emitted: that means a `.d.ts` sits next to a
`.ts` of the same basename and the copy would replace a module's real API with
an ambient file. `shared-logging/src/logger.d.ts` was exactly that, a dead
duplicate of `src/types/hono.d.ts`, and it was deleted.

### `link:` dependencies cannot be published

`@nxgt/shared-hono` depended on `stx-sdk` through `link:stx-sdk`, which no
consumer installing from a registry can resolve. It is now an **optional peer
dependency**, satisfied by the consuming app's own `link:stx-sdk`, plus a
`devDependency` here so this workspace can typecheck and build. `stx-sdk`,
`@nxgt/material` and `@nxgt/map` are on no registry; if another package here
ever needs one, it takes the same shape. `peerDependenciesMeta.optional` is not
decoration — without it `bun install` tries to fetch `stx-sdk` from npm and
fails with a 404.

## Releasing, and what it means for a consumer

Changesets, independent versions. `bun changeset` describes a change; merging to
`develop` opens a "Version Packages" PR; merging that PR publishes.

**A fix in a package is a release before it is a consumer PR.** This is the
constraint the split introduced, and it is the same one `nxgt-ory` introduced
for Keto namespaces: nothing in `sellix-monorepo` or `nxgt-federation` compiles
against an unpublished change, and nothing warns you. Sequence it as: change
here → release → bump the dependency in the consumer.

To try a change without releasing, `bun run build` here and `bun link` the
package in the consumer. Remember to undo it — a stale link is indistinguishable
from a published version until it isn't.

## Deliberate duplication — do not "clean this up"

Reconciling the two forks kept both behaviours wherever they genuinely differed,
because none of the severe conflicts was covered by a test on either side and
picking a winner would have silently changed production behaviour in one repo.
The following pairs exist on purpose:

| Both kept | Why |
| --- | --- |
| `paginate` (offset) and `paginateCursor` (Relay) | sellix pages by offset, federation by cursor; same name, incompatible signatures |
| `Principal` and `TokenPrincipal` | gateway-header shape vs JWT-claims shape — two different models of "the authenticated caller" |
| the REST filter helpers and the GraphQL filter DSL | two filter philosophies that shared a filename and two function names |
| `objectIdFromString` and `toObjectId` | the same conversion under two names; one aliases the other |

Converging each pair onto one implementation is real work with real decisions
in it. It is not a tidy-up, and it is not this repository's to do unasked.

## Conventions

Inherited from both monorepos and unchanged:

- **Mongoose is imported from `@nxgt/shared-mongo`**, never directly from
  `mongoose`, in every package above it in the layering. `shared` is the one
  exception: it declares `mongoose` directly and is the layer `shared-mongo`
  builds on.
- Biome for formatting and linting: tabs, single quotes. `bun biome check
  --write` before committing.
- Commit messages: `<type>: <Capitalized summary>`, types `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`.

## Known state

`bun test` is **115 pass / 7 fail** on a clean tree. The seven failures are in
`shared-storage` and predate this repository — they need a live S3/MinIO, and
their fixture path (`src/assets/images/...`) is resolved relative to the
process's working directory, so they only pass when run from inside
`packages/shared-storage`. The count is identical to what `sellix-monorepo`
produced before the extraction. Treat any *eighth* failure as yours.
