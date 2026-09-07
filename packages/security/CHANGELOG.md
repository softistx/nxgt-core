# @nxgt/security

## 3.0.0

### Major Changes

- [#41](https://github.com/softistx/nxgt-core/pull/41) [`76cdb22`](https://github.com/softistx/nxgt-core/commit/76cdb22b07a1c843479672cd59180f0ee961d8af) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The `keto` term on the GraphQL side, and one wrapper that stops dropping decisions
  
  A GraphQL rule now carries a `keto` list, the declarative statement of what the
  `@check` directive says on a field: rungs, denials and i18n keys, `view` then
  `edit`. Ids are read from `args.<path>` or `source.<path>` — `source.` being how
  a field on a returned type names its object, e.g. `User.email` guarded by
  `source.id`.
  
  The field is declared per transport rather than on the shared rule entry,
  because only the id grammar differs and it differs in a way the schema must
  enforce: written once, REST's `param.id` would be accepted under `graphql:`,
  autocompleted, and then resolve nothing at request time. Rule entries on both
  sides are now `.strict()`.
  
  Everything else is shared in code — `evaluateKetoRungs` walks the rungs,
  short-circuits and maps denials for both evaluators, over the one
  `evaluateRequirement` from `stx-sdk/ory`.
  
  **Breaking:** `evaluateGraphql` is now `async`, like `evaluateRest`. Callers
  using `applyGraphqlPolicy` need no code change.
  
  **Breaking, and a fix:** `applyGraphqlPolicy` branched on `DENY` alone, so a
  field under a rule that `evaluateRest` answers 401 for let an anonymous caller
  straight through to its resolver — one rule, two answers depending on the
  transport.
  It now throws `UNAUTHENTICATED` for a caller the floor turned away, and carries
  a Keto rung's code and message onto the `GraphQLError`.
  
  `stx-sdk` stays an optional peer: the new
  `@nxgt/security/integrations/graphql/keto` entrypoint is the only module on this
  side that imports it.

## 2.0.0

### Major Changes

- [#39](https://github.com/softistx/nxgt-core/pull/39) [`3a9d46c`](https://github.com/softistx/nxgt-core/commit/3a9d46c6e9741b41381ad8e2d3dda3c57e87af34) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ask Keto from a rules file: the `keto` term, and an async `evaluateRest`
  
  `authorities` asks what a caller carries. It cannot ask what an Ory-native API
  needs to know — may this caller `view` `Bookmark:b1` — a question about one
  object. A REST rule can now carry a `keto` list, in the same `[[A, B], [C]]`
  grammar as the `@check` directive and `ketoCheck()`, each rung with its own
  `onDeny` and `message`. Two rungs, `view` then `edit`, is the 404-then-403
  ladder, written where the rest of the route's policy already lives.
  
  The DNF walk is `evaluateRequirement` from `stx-sdk/ory`, not a copy, so the
  rules file and the two existing mechanisms cannot come to disagree.
  
  **Breaking:** `evaluateRest` is now `async` — a Keto term is a remote question.
  Callers using `policyGuard` need no code change, only the version.
  `evaluateGraphql` stays synchronous and accepts no Keto term.
  
  `EvaluateResult` grows two optional fields, `denial` and `message`, set only by
  a Keto rung; every refusal that existed before keeps answering exactly what it
  did. GraphQL rule entries are now `.strict()`, so a REST-only key that wanders
  into one fails at startup instead of being stripped in silence.
  
  `stx-sdk` is a new **optional** peer dependency, imported only by the new
  `@nxgt/security/integrations/hono/keto` entrypoint — a service with no `keto`
  term never resolves it.
  
  The generated JSON Schema moves to `schema/rules.schema.json` and is now in
  `files`, so it ships. Rules files point their `# yaml-language-server:
  $schema=` pragma at `node_modules/@nxgt/security/schema/rules.schema.json`.
  While this package lived inside the consuming monorepo those pragmas pointed
  at its source tree; after the extraction to nxgt-core they resolved to
  nothing, and the completion they exist for had been silently gone from three
  production rules files.

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
- Updated dependencies [[`f1829a2`](https://github.com/softistx/nxgt-core/commit/f1829a2f2284e216a7f786e5d3698c4743797a1a)]:
  - @nxgt/shared@1.0.2
  - @nxgt/shared-exceptions@1.0.2
  - @nxgt/shared-logging@1.0.2

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
- Updated dependencies [[`c3b40bd`](https://github.com/softistx/nxgt-core/commit/c3b40bddd24a0843d4e1826935c66a378100e98e)]:
  - @nxgt/shared@1.0.1
  - @nxgt/shared-exceptions@1.0.1
  - @nxgt/shared-logging@1.0.1
