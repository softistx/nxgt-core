# @nxgt/shared

## 1.0.5

### Patch Changes

- [#124](https://github.com/softistx/nxgt-core/pull/124) [`96e4109`](https://github.com/softistx/nxgt-core/commit/96e41095f19a21b61b9d6ef220e96d7352088a94) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Entry points share one copy of what they have in common
  
  `build.ts` ran `Bun.build` without `splitting`, so a module imported by two
  entry points was inlined into **both** bundles. For these four packages that was
  27% of the JavaScript this workspace publishes — `@nxgt/shared-events` alone now
  emits ten shared chunks where it previously carried ten duplicates.
  
  No class was duplicated here, which is the only reason this is a patch and not
  an incident. The same setting in nxgt-ory gave `@nxgt/ory-sdk` two
  `OryUnavailable` classes, one per entry point, so an `instanceof` between them
  was false and nine routes answered 500 where they meant 503 — through a green
  build, a green typecheck, and a `verify:artifacts` that loaded every subpath.
  
  `verify:artifacts` now refuses a tarball that defines any class in more than one
  entry bundle, so the day one of these packages grows a shared class it is a
  failed check rather than a runtime surprise in a consumer.
- Updated dependencies [[`96e4109`](https://github.com/softistx/nxgt-core/commit/96e41095f19a21b61b9d6ef220e96d7352088a94)]:
  - @nxgt/shared-events@1.0.5

## 1.0.4

### Patch Changes

- [#85](https://github.com/softistx/nxgt-core/pull/85) [`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.
- Updated dependencies [[`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38)]:
  - @nxgt/shared-events@1.0.4
  - @nxgt/shared-logging@1.0.4

## 1.0.3

### Patch Changes

- [#57](https://github.com/softistx/nxgt-core/pull/57) [`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship complete npm pages for every package.
  
  Each README now has the same shape — what it is, install, subpaths, usage,
  then the traps — and covers the public API a consumer actually imports,
  not just the one-line summary. `@nxgt/security` keeps the engine, keto,
  unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
  paths and the Oathkeeper paragraph that no longer name anything.
- Updated dependencies [[`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc), [`4551db1`](https://github.com/softistx/nxgt-core/commit/4551db1fcde486ff3c4d8fc47763d2affd09625a), [`49bb8a3`](https://github.com/softistx/nxgt-core/commit/49bb8a34c1b5002f1f5379c722379c597efe0b83)]:
  - @nxgt/shared-logging@1.0.3
  - @nxgt/shared-events@1.0.3

## 1.0.2

### Patch Changes

- [#17](https://github.com/softistx/nxgt-core/pull/17) [`f1829a2`](https://github.com/softistx/nxgt-core/commit/f1829a2f2284e216a7f786e5d3698c4743797a1a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Write a real README for every package.
  
  The README is in `files`, so it is the package's page on npmjs — the first
  thing anyone outside these repositories reads. Ten of the twelve shipped the
  `bun init` boilerplate ("To run: `bun run src/index.ts`", which is not how a
  library is used), and five of those carried the **wrong package name** in the
  heading: `@nxgt/shared-logging` announced itself as `@nxgt/shared`,
  `@nxgt/shared-graphql` as `@nxgt/shared-exceptions`.
  
  Each now says what the package is, tables its subpaths, and names what will
  bite a consumer — `SHARED_SCHEMA_PATH` rather than a path into `src/`, `code`
  against `errorCode`, why mongoose must be imported from `@nxgt/shared-mongo`,
  which principal shape a context carries.
- Updated dependencies [[`f1829a2`](https://github.com/softistx/nxgt-core/commit/f1829a2f2284e216a7f786e5d3698c4743797a1a)]:
  - @nxgt/shared-events@1.0.2
  - @nxgt/shared-logging@1.0.2

## 1.0.1

### Patch Changes

- [#14](https://github.com/softistx/nxgt-core/pull/14) [`c3b40bd`](https://github.com/softistx/nxgt-core/commit/c3b40bddd24a0843d4e1826935c66a378100e98e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Depend on siblings by range, not by exact version.
  
  `workspace:*` publishes as the exact version, so `@nxgt/shared-hono@1.0.2`
  demanded `@nxgt/shared-mongo@1.0.0` while the consuming app's own `^1.0.0`
  resolved to `1.1.0`. Both landed in the tree, each registered the `Audit` and
  `Migration` Mongoose models, and the second threw `OverwriteModelError` — 52
  failing specs in nxgt-federation, and two copies of the package in
  sellix-monorepo already.
  
  Internal dependencies are now `workspace:^`, which publishes as a caret range
  and dedupes. `verify-artifacts.ts` fails on an exact sibling pin so this cannot
  come back.
- Updated dependencies [[`c3b40bd`](https://github.com/softistx/nxgt-core/commit/c3b40bddd24a0843d4e1826935c66a378100e98e)]:
  - @nxgt/shared-events@1.0.1
  - @nxgt/shared-logging@1.0.1
