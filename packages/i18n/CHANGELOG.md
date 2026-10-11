# @nxgt/i18n

## 2.1.0

### Minor Changes

- [#245](https://github.com/softistx/nxgt-core/pull/245) [`551b620`](https://github.com/softistx/nxgt-core/commit/551b6208e432c691f1b3e516cad4e01a522a53bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accepts TypeScript 7 as well as 6: the `typescript` peer is now `^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set installs with either and no peer conflict. The package does not use TypeScript at runtime; its built JavaScript and declarations are checked under both. Nothing changes under TypeScript 6.

## 2.0.1

### Patch Changes

- [#213](https://github.com/softistx/nxgt-core/pull/213) [`658ff99`](https://github.com/softistx/nxgt-core/commit/658ff99e2481c99f806509b4ccc837713bb031be) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `buildListStringPatch` and `buildListStringPatchUpdate` refuse a patch that gives more than one of `replace`, `add` and `remove`. Those combinations already failed: they named the path under two operators (`$addToSet`, `$pullAll`, or the `$set` a `replace` becomes), and MongoDB refused the whole update with code 40, "Updating the path 'tags' would create a conflict at 'tags'". A schema with the errors plugin answered that with a generic 400 (`errors.something-went-wrong`), and without it the raw `MongoServerError` surfaced. They now fail early, before any query, with a 400 `CustomException` whose message is `errors.list-patch-one-operation-per-path` (added to `@nxgt/i18n` in English and French) and whose `options.path` names the path. An empty array emits nothing and does not count. Send the operations as separate updates, or resolve the whole list with `resolveListStringPatch`. The return type is unchanged.

## 2.0.0

### Major Changes

- [#169](https://github.com/softistx/nxgt-core/pull/169) [`e307f99`](https://github.com/softistx/nxgt-core/commit/e307f99c98775754516d113ff918d0c3963c151c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/i18n` no longer reads the Hono request context: `getLanguage()` asks the language sources registered with `registerLanguageSource()`, then `localStorage`, then the fallback, and the package no longer depends on `hono`. `@nxgt/shared-hono` registers the Hono source (`honoLanguageSource`, `useHonoLanguage()`) when imported and declares `c.get('language')`; `@nxgt/shared-graphql`'s `createYogaHono()` registers it too. An app on `@nxgt/shared-hono` sees no difference; one that used `@nxgt/i18n` beside Hono without it calls `useHonoLanguage()`.

## 1.1.0

### Minor Changes

- [#144](https://github.com/softistx/nxgt-core/pull/144) [`9dcd56d`](https://github.com/softistx/nxgt-core/commit/9dcd56d9c9c4155a2e7384c65210dc2110ca4cfd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A `browser` export condition, for a client bundle
  
  `import { translate } from '@nxgt/i18n'` is unchanged, but a bundler that
  resolves the `browser` condition (Vite, Nuxt's client build) now gets an
  entry that never imports `hono/context-storage` — the only thing here that
  is Node-only. `getLanguage()` behaves the same either way: it just drops the
  Hono request-context step there is no request to read in a browser, and
  falls straight to `localStorage`, then `FALLBACK_LANGUAGE`.
  
  Also moves `intl-messageformat` to `^12.1.2`, to match the version
  `@nxgt/i18n-vue` pins.

## 1.0.4

### Patch Changes

- [#85](https://github.com/softistx/nxgt-core/pull/85) [`4704393`](https://github.com/softistx/nxgt-core/commit/4704393e3e980e05002d1da52c84055e53fa5c38) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.

## 1.0.3

### Patch Changes

- [#57](https://github.com/softistx/nxgt-core/pull/57) [`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship complete npm pages for every package.
  
  Each README now has the same shape — what it is, install, subpaths, usage,
  then the traps — and covers the public API a consumer actually imports,
  not just the one-line summary. `@nxgt/security` keeps the engine, keto,
  unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
  paths and the Oathkeeper paragraph that no longer name anything.

- [#53](https://github.com/softistx/nxgt-core/pull/53) [`49bb8a3`](https://github.com/softistx/nxgt-core/commit/49bb8a34c1b5002f1f5379c722379c597efe0b83) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship READMEs that name the traps, not just the install.
  
  `@nxgt/i18n` now says how `getLanguage` resolves (request, then
  `localStorage`, then `'en'`) and that `createTranslator` takes a service's
  own catalogues. `@nxgt/shared-logging` now says that importing the package
  constructs a default `logger` against `logs/` relative to the process cwd —
  a container that mounts nothing there crashes on the first import, not on
  the first `createLogger` call — and that `Logger` is this package's export
  because naming winston's type through a nested `node_modules` is TS2883.

## 1.0.2

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

## 1.0.1

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
