# @nxgt/shared-graphql

## 1.2.3

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
  - @nxgt/security@1.0.2
  - @nxgt/shared@1.0.2
  - @nxgt/shared-exceptions@1.0.2
  - @nxgt/shared-logging@1.0.2
  - @nxgt/shared-mongo@1.1.2

## 1.2.2

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
  - @nxgt/security@1.0.1
  - @nxgt/shared@1.0.1
  - @nxgt/shared-exceptions@1.0.1
  - @nxgt/shared-logging@1.0.1
  - @nxgt/shared-mongo@1.1.1

## 1.2.1

### Patch Changes

- Updated dependencies [[`d7e75d4`](https://github.com/softistx/nxgt-core/commit/d7e75d47e01aedb9106c946c730b0ef6c36a691d)]:
  - @nxgt/shared-mongo@1.1.0

## 1.2.0

### Minor Changes

- [#10](https://github.com/softistx/nxgt-core/pull/10) [`9d6777a`](https://github.com/softistx/nxgt-core/commit/9d6777a48edbfdf943b52c934c23ca4dc77f98b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship the shared `.graphqls` in the tarball.
  
  The package's SDL — the `Void` scalar, the filter inputs, the shared object
  types — lived under `src/`, which `files` excludes, so a consumer installing
  from the registry got the resolvers without the types they resolve. It now
  lives in `graphql/` at the package root and is published.
  
  `SHARED_SCHEMA_PATH` points at it. It used to be `join(__dirname, './**/*.graphqls')`,
  which resolved to `dist/` in a published package and to `src/utils/` in the
  workspace — neither holds any SDL. It now walks up to the package root, which
  is the one anchor both layouts share.

## 1.1.0

### Minor Changes

- [#8](https://github.com/softistx/nxgt-core/pull/8) [`8628ff5`](https://github.com/softistx/nxgt-core/commit/8628ff5c89ed4ea64a588b0744af02ec12800f22) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The GraphQL context carries a `TokenPrincipal`, not a `Principal`. This package
  is nxgt-federation's alone — sellix-monorepo has no GraphQL — and what its
  server puts in the context is a decoded JWT: `sub`, `uid`, `scope`. `Principal`
  is the gateway-header shape, and after the merge it is the one the plain name
  resolves to, so `GraphQLBaseContext`, `PrincipalContext`, the `extract-jwt`
  plugin and the websocket context all promised a caller shape their own code
  never produces. `ws-context.ts` gave it away: it reads `data.sub` and casts.

## 1.0.1

### Patch Changes

- Updated dependencies [[`95c0ec0`](https://github.com/softistx/nxgt-core/commit/95c0ec06dd1f3d3d0f527bc0e8689f40a99195d1)]:
  - @nxgt/shared-mongo@1.0.1
