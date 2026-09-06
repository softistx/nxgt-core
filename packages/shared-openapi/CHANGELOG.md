# @nxgt/shared-openapi

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
