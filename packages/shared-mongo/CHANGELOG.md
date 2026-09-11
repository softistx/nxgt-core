# @nxgt/shared-mongo

## 1.1.3

### Patch Changes

- [#57](https://github.com/softistx/nxgt-core/pull/57) [`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship complete npm pages for every package.
  
  Each README now has the same shape — what it is, install, subpaths, usage,
  then the traps — and covers the public API a consumer actually imports,
  not just the one-line summary. `@nxgt/security` keeps the engine, keto,
  unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
  paths and the Oathkeeper paragraph that no longer name anything.

- [#54](https://github.com/softistx/nxgt-core/pull/54) [`4551db1`](https://github.com/softistx/nxgt-core/commit/4551db1fcde486ff3c4d8fc47763d2affd09625a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship READMEs that name the traps, not just the install.
  
  `@nxgt/shared-mongo` now says the REST and GraphQL filter helpers share
  names with incompatible meanings (`buildArrayFilter` is exact-match vs
  `$in`). `@nxgt/shared-storage` now says `createLazyStorage` must be a
  module-level const, `StorageService` fires an unawaited bucket check in
  its constructor, and the four `S3_*` variables default to a local MinIO
  rather than failing closed.
  `@nxgt/shared-events` now says adding an event is a release before it is
  a consumer change.
- Updated dependencies [[`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc), [`49bb8a3`](https://github.com/softistx/nxgt-core/commit/49bb8a34c1b5002f1f5379c722379c597efe0b83)]:
  - @nxgt/i18n@1.0.3
  - @nxgt/shared-logging@1.0.3
  - @nxgt/shared-exceptions@1.0.3
  - @nxgt/shared@1.0.3

## 1.1.2

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
  - @nxgt/i18n@1.0.2
  - @nxgt/shared@1.0.2
  - @nxgt/shared-exceptions@1.0.2
  - @nxgt/shared-logging@1.0.2

## 1.1.1

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
  - @nxgt/i18n@1.0.1
  - @nxgt/shared@1.0.1
  - @nxgt/shared-exceptions@1.0.1
  - @nxgt/shared-logging@1.0.1

## 1.1.0

### Minor Changes

- [#12](https://github.com/softistx/nxgt-core/pull/12) [`d7e75d4`](https://github.com/softistx/nxgt-core/commit/d7e75d47e01aedb9106c946c730b0ef6c36a691d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Let a service say which principal shape it is given.
  
  `MongoCrudService` hard-coded `Principal`, the caller as the gateway's
  `X-User-*` headers describe them. federation's services are handed
  `TokenPrincipal`, the caller as the access token describes them, and read `uid`
  and `sub` off it — fields `Principal` does not have. The two shapes were kept
  side by side on purpose during the merge; the constructor quietly picked one.
  
  It now takes a fourth type parameter, `P extends Principal | TokenPrincipal`,
  defaulting to `Principal` so nothing that compiles today changes.

## 1.0.1

### Patch Changes

- [#3](https://github.com/softistx/nxgt-core/pull/3) [`95c0ec0`](https://github.com/softistx/nxgt-core/commit/95c0ec06dd1f3d3d0f527bc0e8689f40a99195d1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `Migration` model no longer throws when its module is evaluated twice in
  one process. `model('Migration', …)` ran at import and mongoose answers
  `OverwriteModelError` the second time — at import, before any code of yours
  runs — so a consumer bundling two entry points that both reach it, or a test
  run loading several files, crashed on a name collision with itself. It now
  reuses the compiled model when there is one.
