# @nxgt/shared-openapi

## 1.1.0

### Minor Changes

- [#3](https://github.com/softistx/nxgt-core/pull/3) [`7631c60`](https://github.com/softistx/nxgt-core/commit/7631c6086304f388f96713276edc4c9bdf9ef3ef) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The package now ships its `openapi/` fragments, not just `dist/`. They are half
  of what it is for: 296 spec files in `sellix-monorepo` `$ref` into
  `openapi/components/**` by relative path, and with the tarball carrying only
  `dist/` there was nothing for them to point at once the packages moved out of
  the monorepo. 56 files, 224 KB.
