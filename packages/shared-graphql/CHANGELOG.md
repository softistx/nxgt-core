# @nxgt/shared-graphql

## 1.5.1

### Patch Changes

- [#57](https://github.com/softistx/nxgt-core/pull/57) [`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship complete npm pages for every package.
  
  Each README now has the same shape — what it is, install, subpaths, usage,
  then the traps — and covers the public API a consumer actually imports,
  not just the one-line summary. `@nxgt/security` keeps the engine, keto,
  unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
  paths and the Oathkeeper paragraph that no longer name anything.
- Updated dependencies [[`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc), [`4551db1`](https://github.com/softistx/nxgt-core/commit/4551db1fcde486ff3c4d8fc47763d2affd09625a), [`49bb8a3`](https://github.com/softistx/nxgt-core/commit/49bb8a34c1b5002f1f5379c722379c597efe0b83)]:
  - @nxgt/i18n@1.0.3
  - @nxgt/shared-logging@1.0.3
  - @nxgt/shared-exceptions@1.0.3
  - @nxgt/shared@1.0.3
  - @nxgt/shared-mongo@1.1.3
  - @nxgt/security@3.2.1

## 1.5.0

### Minor Changes

- [#44](https://github.com/softistx/nxgt-core/pull/44) [`2163604`](https://github.com/softistx/nxgt-core/commit/216360404ccea2373a109b3c8b7718119da64c72) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Claims speak Kratos, from one mapper instead of two
  
  `PolicyClaims` is now Kratos/OIDC-shaped. `kind`, `email`, `email_verified`,
  `aal` and `aud` are first-class and documented — an Ory caller has carried them
  all along, but they existed only through the index signature, so a rule could
  read them and nothing said they were there. The oauth-api vocabulary
  (`username`, `authorities`, `roles`, `permissions`, `uid`, `user`) stays and is
  still checked by `checkAuthorities`, marked `@deprecated`: `apps/oauth` is being
  retired in favour of Kratos/Hydra/Keto, and three rules documents in production
  still name those fields. `user` went from `any` to `unknown`; nothing in the
  parc reads it.
  
  The new `@nxgt/security/integrations/ory` entrypoint exports
  `claimsFromOryPrincipal`, and `oryAuth()` (Hono) and `useOryAuth()` (Yoga) both
  call it. They used to build the object themselves, and had drifted: the REST one
  wrote `exp` as an **ISO string** into a field declared `number`, so
  `claims.exp < Date.now() / 1000` compared a string to a number and was false for
  every value it could hold; the GraphQL one wrote seconds but dropped
  `email_verified`, `aal` and `aud` entirely, so `expression: "claims.aal ===
  'aal2'"` guarded a REST route and silently guarded nothing on a field. One
  mapper is what stops that, the same way one `evaluateRequirement` stops the three
  Keto vocabularies disagreeing.
  
  `useOryAuth()` now puts `claims` on the GraphQL context beside `user`. That is
  additive — `user` is unchanged, services read it — and it is what
  `applyGraphqlPolicy`'s `getClaims` should return: `TokenPrincipal` has nowhere to
  put `email_verified` or `aal`.
  
  `policyGuard` also stopped logging every Ory-native decision against
  "anonymous". It named the caller by `username` only, which an Ory caller does
  not have; it now falls back to `sub`, then `clientId`.
  
  Consumers: an Ory-native app that reads `claims.exp` gets a number where it got
  a string. Nothing in the parc did. A GraphQL app can switch its `getClaims` from
  `context.user` to `context.claims` to gain the four claims it was missing.

### Patch Changes

- Updated dependencies [[`2163604`](https://github.com/softistx/nxgt-core/commit/216360404ccea2373a109b3c8b7718119da64c72)]:
  - @nxgt/security@3.2.0

## 1.4.2

### Patch Changes

- Updated dependencies [[`76cdb22`](https://github.com/softistx/nxgt-core/commit/76cdb22b07a1c843479672cd59180f0ee961d8af)]:
  - @nxgt/security@3.0.0

## 1.4.1

### Patch Changes

- Updated dependencies [[`3a9d46c`](https://github.com/softistx/nxgt-core/commit/3a9d46c6e9741b41381ad8e2d3dda3c57e87af34)]:
  - @nxgt/security@2.0.0

## 1.4.0

### Minor Changes

- [#27](https://github.com/softistx/nxgt-core/pull/27) [`cfd8215`](https://github.com/softistx/nxgt-core/commit/cfd8215a8a19f181cdc6aecc3fd5f64f5f58fab3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Let a check word its refusal like the layer beneath it.
  
  `@check` and `ketoCheck` take a `message` — the i18n key a denial carries —
  falling back to the shared `errors.not-found` and
  `errors.insufficient-permissions` as before.
  
  This is not cosmetic. A field or route guarded by one of these is guarded
  **twice**: once declaratively, and again by the `require<M>Access` its service
  calls, because the service is reachable from places the schema is not. Both
  answer 404 for a caller who may not see the object. If they word that 404
  differently — "Could not find the requested resource." from the directive,
  "Note not found." from the service — the wording alone tells the caller which
  layer spoke, and therefore whether the object exists.
  
  That is the exact distinction `NOT_FOUND` is there to hide, and it appeared the
  first time a real API adopted the directive.

## 1.3.0

### Minor Changes

- [#25](https://github.com/softistx/nxgt-core/pull/25) [`8f8da52`](https://github.com/softistx/nxgt-core/commit/8f8da521309ed9d6787d7e51bd9f4b00f6dd115b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Let a schema and a route say which Keto permission they require.
  
  An Ory-native API knows two things about a caller and can express only one of
  them. `@authenticated` and a rules file's `authenticated: true` ask whether
  anyone is calling; nothing asks **may this caller `view` `Note:n1`** — a
  question about one object, which is the only kind Keto answers. So that
  question lived in prose: "Needs `edit`", "NOT_FOUND unless the caller holds
  `view`", written in a docstring or a comment, true until it was not.
  
  Two integrations of one grammar now say it where it is read:
  
  ```graphql
  note(id: ID!): Note!
  	@check(permissions: [[{ namespace: "Note", permit: "view" }]])
  ```
  
  ```ts
  app.get('/:id',
    ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]]),
    handler);
  ```
  
  `permissions` is disjunctive normal form — outer list OR, inner list AND — the
  same shape `@policy(policies: [["ADMIN"]])` already uses. Both are repeatable,
  and evaluated in declaration order with their own `onDeny`, which is how a
  denial stays a **404 for a stranger** (an id cannot be probed) and a **403 for
  a viewer** (who already knows the object exists). The evaluator itself is
  `stx-sdk/ory`'s, so the two cannot drift.
  
  `@nxgt/shared-graphql` adds `useKetoChecks(ory)`, `applyKetoChecks(schema)` and
  the SDL in `graphql/directives/check.graphqls` — shipped, so any schema built
  from `SHARED_SCHEMA_PATH` already declares `@check`.
  
  `@nxgt/shared-hono` adds `ketoCheck()`, `useOry()` and `requireAuthenticated()`
  — the last being everything a rules file said about an Ory-native API, since
  `oryAuth()` lets an anonymous caller through on purpose.
  
  Both put a **per-request loader** on the context that batches distinct
  questions into one `POST /relation-tuples/batch/check` and memoises identical
  ones. So the access layer that already asks Keto keeps asking, and the second
  question costs nothing.
  
  Nothing changes for a consumer that does not use them. One that does needs
  `stx-sdk` **1.1.0**, where the grammar and `ory.checkMany` live: the peer range
  moved to `>=1.1.0`.
  
  Neither covers a field or route that answers a **list** the caller is entitled
  to. That is not a check but a Keto query folded into the database filter before
  the read, and filtering after would make `totalCount` and the cursors lie.

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
