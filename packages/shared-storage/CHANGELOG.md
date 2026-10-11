# @nxgt/shared-storage

## 1.1.0

### Minor Changes

- [#245](https://github.com/softistx/nxgt-core/pull/245) [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accepts TypeScript 7 as well as 6: the `typescript` peer is now `^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set installs with either and no peer conflict. The package does not use TypeScript at runtime; its built JavaScript and declarations are checked under both. Nothing changes under TypeScript 6.

### Patch Changes

- Updated dependencies [[`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc), [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc), [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc), [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc), [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc)]:
  - @nxgt/i18n@2.1.0
  - @nxgt/shared-exceptions@1.1.0
  - @nxgt/shared-logging@1.1.0
  - @nxgt/shared-mongo@1.2.0
  - @nxgt/shared@1.1.0

## 1.0.9

### Patch Changes

- [#235](https://github.com/softistx/nxgt-core/pull/235) [`542c4b2`](https://github.com/softistx/nxgt-core/commit/542c4b278d7c812aad05870053d798818dbec98f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `StorageService` now throws the exceptions it documents. Each method awaits the SDK call inside its `try`, so a failed S3 call surfaces as a `CustomException` 500 carrying the method's message key instead of the raw SDK error. A missing key stays the 404 `storage.errors.file-not-found` rather than being rewrapped as a 500, and its message is the key with `{ key }` as options, so the handler that renders it no longer translates it twice. `fetch` now requests the object it names: the bucket goes in the S3 options, not in the `s3://` URL, which made every file a 404 when `S3_BUCKET` was set.
- Updated dependencies [[`5e3fb97`](https://github.com/softistx/nxgt-core/commit/5e3fb97b41a79e9d64d5e4331d67c24790aa2659)]:
  - @nxgt/shared-logging@1.0.5

## 1.0.8

### Patch Changes

- [#183](https://github.com/softistx/nxgt-core/pull/183) [`46d6137`](https://github.com/softistx/nxgt-core/commit/46d61372f3551c97bc6dd9be93b011a792cd4845) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Class fields are now emitted with define semantics (`MinioService`, `StorageService`, `GridFSService`), and `StorageService` passes `ensureExists` `{}` instead of `{ bucket: undefined }`.
- Updated dependencies [[`750a1f7`](https://github.com/softistx/nxgt-core/commit/750a1f7a447d5c558b16ab021a612ad6ce3aedd7)]:
  - @nxgt/shared@1.0.6
  - @nxgt/shared-exceptions@1.0.6
  - @nxgt/shared-mongo@1.1.6

## 1.0.7

### Patch Changes

- Updated dependencies [[`e307f99`](https://github.com/softistx/nxgt-core/commit/e307f99c98775754516d113ff918d0c3963c151c)]:
  - @nxgt/i18n@2.0.0
  - @nxgt/shared-exceptions@1.0.5
  - @nxgt/shared-mongo@1.1.5

## 1.0.6

### Patch Changes

- [#85](https://github.com/softistx/nxgt-core/pull/85) [`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.
- Updated dependencies [[`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38)]:
  - @nxgt/i18n@1.0.4
  - @nxgt/shared@1.0.4
  - @nxgt/shared-exceptions@1.0.4
  - @nxgt/shared-logging@1.0.4
  - @nxgt/shared-mongo@1.1.4

## 1.0.5

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
- Updated dependencies [[`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc), [`4551db1`](https://github.com/softistx/nxgt-core/commit/4551db1fcde486ff3c4d8fc47763d2affd09625a), [`49bb8a3`](https://github.com/softistx/nxgt-core/commit/49bb8a34c1b5002f1f5379c722379c597efe0b83)]:
  - @nxgt/i18n@1.0.3
  - @nxgt/shared-logging@1.0.3
  - @nxgt/shared-exceptions@1.0.3
  - @nxgt/shared@1.0.3
  - @nxgt/shared-mongo@1.1.3

## 1.0.4

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
  - @nxgt/shared-mongo@1.1.2

## 1.0.3

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
  - @nxgt/shared-mongo@1.1.1

## 1.0.2

### Patch Changes

- Updated dependencies [[`d7e75d4`](https://github.com/softistx/nxgt-core/commit/d7e75d47e01aedb9106c946c730b0ef6c36a691d)]:
  - @nxgt/shared-mongo@1.1.0

## 1.0.1

### Patch Changes

- Updated dependencies [[`95c0ec0`](https://github.com/softistx/nxgt-core/commit/95c0ec06dd1f3d3d0f527bc0e8689f40a99195d1)]:
  - @nxgt/shared-mongo@1.0.1
