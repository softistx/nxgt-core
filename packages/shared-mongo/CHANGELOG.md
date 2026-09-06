# @nxgt/shared-mongo

## 1.0.1

### Patch Changes

- [#3](https://github.com/softistx/nxgt-core/pull/3) [`95c0ec0`](https://github.com/softistx/nxgt-core/commit/95c0ec06dd1f3d3d0f527bc0e8689f40a99195d1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `Migration` model no longer throws when its module is evaluated twice in
  one process. `model('Migration', …)` ran at import and mongoose answers
  `OverwriteModelError` the second time — at import, before any code of yours
  runs — so a consumer bundling two entry points that both reach it, or a test
  run loading several files, crashed on a name collision with itself. It now
  reuses the compiled model when there is one.
