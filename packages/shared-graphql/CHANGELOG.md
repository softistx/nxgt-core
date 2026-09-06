# @nxgt/shared-graphql

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
