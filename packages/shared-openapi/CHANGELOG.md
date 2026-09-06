# @nxgt/shared-openapi

## 1.2.2

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

## 1.2.1

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

## 1.2.0

### Minor Changes

- [#6](https://github.com/softistx/nxgt-core/pull/6) [`a8fd880`](https://github.com/softistx/nxgt-core/commit/a8fd880a60f8c326b00847f188f7cf95e71b63d0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `CursorPageInfo` declares `startCursor` and `endCursor` as nullable, which is
  what the API actually returns. `@nxgt/shared-mongo`'s `cursorPaginate` answers
  `null` for both on an empty page — it has always done so — while this schema
  promised a string or nothing. Every client generated from it was wrong about
  the one case it is most likely to meet, and no consumer noticed because the
  mismatch only surfaces where a route's return type is annotated.

## 1.1.0

### Minor Changes

- [#3](https://github.com/softistx/nxgt-core/pull/3) [`7631c60`](https://github.com/softistx/nxgt-core/commit/7631c6086304f388f96713276edc4c9bdf9ef3ef) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The package now ships its `openapi/` fragments, not just `dist/`. They are half
  of what it is for: 296 spec files in `sellix-monorepo` `$ref` into
  `openapi/components/**` by relative path, and with the tarball carrying only
  `dist/` there was nothing for them to point at once the packages moved out of
  the monorepo. 56 files, 224 KB.
