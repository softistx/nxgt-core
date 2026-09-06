# @nxgt/shared-mongo

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
