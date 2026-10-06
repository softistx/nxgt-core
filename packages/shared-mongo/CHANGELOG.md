# @nxgt/shared-mongo

## 1.1.11

### Patch Changes

- [#206](https://github.com/softistx/nxgt-core/pull/206) [`77a3f3b`](https://github.com/softistx/nxgt-core/commit/77a3f3be280604cacf2fd50d5840c01ecbd79c6a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Fix the internal soft-delete plugin's `find` and `countDocuments` overrides (and their `…Deleted` variants) overwriting a `deleted` the caller's filter already named: `{ deleted: true }` or `{ deleted: { $exists: false } }` was replaced by the plugin's own condition. The two are now combined with `$and`, so the caller's condition applies and deleted documents are still excluded, as for `aggregate`. A filter that does not name `deleted` is unchanged. The plugin is internal — neither exported from the package nor part of `MONGOOSE_PLUGINS` — so no consumer reaches this through the public surface.

## 1.1.10

### Patch Changes

- [#202](https://github.com/softistx/nxgt-core/pull/202) [`d1fb6a1`](https://github.com/softistx/nxgt-core/commit/d1fb6a1f0c41b2edda591ffaa33b1a90580a67b9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Fix the statics of the soft-delete plugin. This affects models that apply the soft-delete plugin, which the package does not export yet (it is neither exported nor in `MONGOOSE_PLUGINS`), so no consumer can reach these today.
  
  - `aggregate`, `aggregateDeleted` and `aggregateWidthDeleted` no longer throw. Their overrides pushed the caller's arguments onto the model instead of onto their own argument list, so every call threw `TypeError: Cannot assign to read only property 'length'` before reaching the server, and they read their arguments as one stage each (mongoose 4's shape), so the caller's pipeline would have been dropped even with the push fixed. They now take mongoose's `(pipeline, options)`.
  - `aggregate` adds `$match: { deleted: { $ne: true } }` and `aggregateDeleted` adds `$match: { deleted: { $eq: true } }` at the head of the pipeline, or right after a stage that must stay first (`$geoNear`, `$search`, `$searchMeta`, `$vectorSearch`). The condition is folded into a `$match` already in that place unless that one names `deleted`, in which case it goes in as a separate stage: a caller's own condition on `deleted` is kept, not overwritten. The caller's pipeline array and stages are no longer mutated.
  - `aggregateWidthDeleted` passes the pipeline through unfiltered. It used to inject `$match: { deleted: undefined }`, which the driver sends as `null` and which would have excluded every document carrying a `deleted` field.
  - **Behaviour change:** `findDeleted` and `countDocumentsDeleted` now return and count the deleted documents only. They built the `deleted: true` filter and then passed the caller's original arguments instead, so they returned and counted every document matching the caller's filter, deleted or not.

- [#203](https://github.com/softistx/nxgt-core/pull/203) [`37f4863`](https://github.com/softistx/nxgt-core/commit/37f4863da7587f66d4e4d2634d6a3e84e3497f4c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Make the paginators' `deleted` option include deleted documents when asked to. This affects models that apply the soft-delete plugin, which the package does not export yet (it is neither exported nor in `MONGOOSE_PLUGINS`), so no consumer can reach this today.
  
  The option was typed `'Deleted' | 'WidthDeleted'`, a misspelling: `paginate`, `paginateOffset` and `cursorPaginate` looked up `findWidthDeleted` and `countDocumentsWidthDeleted`, which the plugin never registered, and silently fell back to `find` and `countDocuments`, so `deleted: 'WidthDeleted'` returned only the documents that were *not* deleted. The option now accepts `'WithDeleted'`, matching the `findWithDeleted` / `countDocumentsWithDeleted` statics. `'WidthDeleted'` is still accepted and now behaves like `'WithDeleted'`, so a caller passing it will now also receive deleted documents, which is what the option asked for. It is deprecated, but only the exported `WidthDeleted` type name carries `@deprecated`: a `'WidthDeleted'` literal is accepted, not flagged by editors. The option's type is exported as `SoftDeleteScope`. The plugin also registers `aggregateWithDeleted`, the consistently named form of `aggregateWidthDeleted`, which remains as an alias.

## 1.1.9

### Patch Changes

- [#198](https://github.com/softistx/nxgt-core/pull/198) [`fc5e453`](https://github.com/softistx/nxgt-core/commit/fc5e4538fb971f725c8eb111cd45dfffa28820b8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Type-check cleanly with `skipLibCheck: false`. The three `Model` augmentations (pagination, soft delete, `ensureExists`/`requireById`) now repeat only mongoose's type parameter names, leaving defaults and heritage to mongoose, and no longer redeclare `schema`. This removes the TS2428 "All declarations of 'Model' must have identical type parameters" and TS2717 "Property 'schema' must be of type …" errors a consumer saw from `dist/types/*.d.ts` and `mongoose/types/models.d.ts`. Every augmented member keeps the same type; `Model#schema` is mongoose's own declaration, which was already the one in effect.
- Updated dependencies [[`c8a1595`](https://github.com/softistx/nxgt-core/commit/c8a1595b25d062afc0322e005adcbce240eaca37)]:
  - @nxgt/shared@1.0.7

## 1.1.8

### Patch Changes

- [#192](https://github.com/softistx/nxgt-core/pull/192) [`e6724b9`](https://github.com/softistx/nxgt-core/commit/e6724b968b85e5c4b72f5d40b0f52dc018ae67a4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Fix the soft-delete type augmentation referring to a global `mongodb.` namespace that was never imported. A consumer with `skipLibCheck: false` got TS2833 and TS2503, and with `skipLibCheck: true` those types silently became `any`. It now imports `mongo` from mongoose as a type, and uses mongoose's own `QueryOptions` where it named the non-existent `MongooseQueryOptions`.

## 1.1.7

### Patch Changes

- [#189](https://github.com/softistx/nxgt-core/pull/189) [`34af85b`](https://github.com/softistx/nxgt-core/commit/34af85b2cd9a25e1c38bae2c3b9cdf765906310c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The published declarations no longer import packages the manifest does not declare. `AUDIT_CHANGE_STREAM` is typed `mongo.ChangeStream` through `mongoose` instead of inferring `import("mongodb").ChangeStream`, and `requireById`'s `errorProps` takes `StatusCode` from `@nxgt/shared-exceptions` instead of `hono/utils/http-status`. A consumer without `hono` or `mongodb` hoisted no longer resolves either to `any`.

## 1.1.6

### Patch Changes

- [#183](https://github.com/softistx/nxgt-core/pull/183) [`750a1f7`](https://github.com/softistx/nxgt-core/commit/750a1f7a447d5c558b16ab021a612ad6ce3aedd7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Declarations changed when the repository's TypeScript config became strict (`exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noUnused*`, `useDefineForClassFields`). Every change is a widening of an input type or a narrowing of an output that was always set; none breaks a consumer:
  
  - `@nxgt/security`: `KetoRung.message`, `KetoDeps.evaluatePermissions` and `KetoDeps.subject` accept an explicit `undefined`.
  - `@nxgt/shared`: `assign()` takes sources whose properties may be an explicit `undefined`, which it already skipped.
  - `@nxgt/shared-exceptions`: `CustomException#debugMessage` is typed `string | null | undefined`.
  - `@nxgt/shared-mongo`: every `VALIDATORS.*` result types `message` as a function, not `... | undefined`, since it was always set; the inferred schema-definition types of `audit.model` and `postal-address.model` lose a redundant `| undefined`.
  
  Two behaviour notes, both invisible to a typed consumer:
  
  - `@nxgt/shared-mongo` and `@nxgt/shared-exceptions` emit their classes with define semantics (`CustomException`, `MongoCrudService`, `MigrationRunner`, and the `*PaginationOptions` classes), so a field declared without an initialiser is now an own key holding `undefined`. `Object.keys(new OffsetPaginationOptions())` is `['filter', 'sort', 'page', 'size']` where it was `[]`.
  - `@nxgt/security`'s `compilePolicy` omits `global`, `graphql` and `compiledExpression` instead of setting them to `undefined`; every reader uses `?.` or a truthiness test.
- Updated dependencies [[`750a1f7`](https://github.com/softistx/nxgt-core/commit/750a1f7a447d5c558b16ab021a612ad6ce3aedd7)]:
  - @nxgt/shared@1.0.6
  - @nxgt/shared-exceptions@1.0.6

## 1.1.5

### Patch Changes

- Updated dependencies [[`e307f99`](https://github.com/softistx/nxgt-core/commit/e307f99c98775754516d113ff918d0c3963c151c)]:
  - @nxgt/i18n@2.0.0
  - @nxgt/shared-exceptions@1.0.5

## 1.1.4

### Patch Changes

- [#85](https://github.com/softistx/nxgt-core/pull/85) [`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.
- Updated dependencies [[`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38)]:
  - @nxgt/i18n@1.0.4
  - @nxgt/shared@1.0.4
  - @nxgt/shared-exceptions@1.0.4
  - @nxgt/shared-logging@1.0.4

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
