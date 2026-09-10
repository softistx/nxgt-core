# @nxgt/shared-mongo

Everything Mongoose in one place: the re-exported driver, `MongoCrudService`,
the audit change-stream, the migration runner, the referential-integrity
registry, pagination, filters and the shared schema plugins.

## Import mongoose from here, never directly

`export * from 'mongoose'` is part of this package's surface. App code must
take `Types`, `ObjectId`, `Connection` and the rest **from
`@nxgt/shared-mongo`** — under Bun's isolated linker a package resolves its own
dependencies, not yours, so a bare `from 'mongoose'` in an app relies on a hoist
that is not guaranteed, even when `tsc` is happy.

It also matters that there is exactly one copy: Mongoose's model registry is a
singleton, and a second copy in the same process makes the second `model()` call
throw `OverwriteModelError`.

## Subpaths

| Subpath | What is in it |
| --- | --- |
| `@nxgt/shared-mongo` | the driver, services, audit, migrations, integrity, plugins |
| `@nxgt/shared-mongo/filters` | the GraphQL filter DSL (`buildStringFilter`, `buildLogicalFilter`, …) |

## Things that bite

- **Integrity keys are `Model.modelName`.** Mongoose sets `Model.name` to the
  string `"model"` for *every* model, so registering under `.name` puts every
  blocker in the process under one key.
- **Two paginations, deliberately.** `paginate` pages by offset (sellix),
  `paginateCursor` returns a Relay connection (federation). Same idea,
  incompatible signatures; both are in production.
- **`MongoCrudService` takes the principal shape as a type parameter**, default
  `Principal`. Services handed a `TokenPrincipal` say so:
  `MongoCrudService<Doc, CreateInput, UpdateInput, TokenPrincipal>`.
- **`clearDatabase()` is guarded** and refuses to run unless `NODE_ENV=test`
  and the database name ends in `-test`. Leave the guard alone; it has already
  stopped one production wipe.
- **Two filter DSLs, same names, incompatible meanings.** REST helpers live on
  the package root; the GraphQL ones live on `@nxgt/shared-mongo/filters`.
  `buildArrayFilter` is an exact match on one side and `$in` on the other.
  Import from the subpath when the input is GraphQL, from the root when it is
  REST query parameters. Do not merge them.

## Install

```bash
bun add @nxgt/shared-mongo
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
