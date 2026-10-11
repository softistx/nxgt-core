# @nxgt/shared-mongo

Everything Mongoose in one place: the re-exported driver, `MongoCrudService`,
the audit change-stream, the migration runner, the referential-integrity
registry, pagination, filters, validators and the shared schema plugins.

## Install

```bash
bun add @nxgt/shared-mongo
```

Public on npmjs; no token needed to install. TypeScript is a peer:
`^6.0.3 || ^7.0.0`, the same range in every `@nxgt/*` package, so the set
installs with either.

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
| `@nxgt/shared-mongo` | the driver, `MongoCrudService`, audit, migrations, integrity, plugins, REST filters, validators |
| `@nxgt/shared-mongo/filters` | the GraphQL filter DSL (`buildStringFilter`, `buildLogicalFilter`, …) |

## CRUD

```ts
class BookmarkService extends MongoCrudService<
	BookmarkDocument,
	CreateBookmarkInput,
	UpdateBookmarkInput,
	TokenPrincipal
> {
	protected model = Bookmark;
	protected mutex = new Mutex();
}
```

The fourth type parameter is the principal shape, default `Principal`. Services
handed a `TokenPrincipal` say so. The class only ever *reads* `name` off it
(audit author); a subclass that reads `uid` or `id` must pick the right `P`.

Writes go through a mutex and the audit change-stream (`runWithChangesListening`).
Deletes consult the integrity registry before they proceed.

## Plugins

```ts
import { applyPlugins, MONGOOSE_PLUGINS } from '@nxgt/shared-mongo';

applyPlugins(schema, [
	MONGOOSE_PLUGINS.shared,      // timestamps, toJSON, …
	MONGOOSE_PLUGINS.errors,      // duplicate-key → CustomException.conflict
	MONGOOSE_PLUGINS.pagination,  // paginate + paginateCursor
	MONGOOSE_PLUGINS.leanVirtuals,
	MONGOOSE_PLUGINS.autopopulate,
]);
```

Model statics the pagination plugin adds:

| Method | What it returns |
| --- | --- |
| `paginate` | Relay connection (federation) |
| `paginateOffset` | offset page (sellix) |
| `cursorPaginate` | cursor page ordered by `_id` — the cursor *is* the `_id` |
| `paginateList` / `paginateListOffset` | the same two shapes over an in-memory list |

Same idea, incompatible signatures; both are in production. There is no
`sort` argument: a second sort key would have to be part of the cursor.

The package also `export * from 'async-mutex'` (`Mutex`), because
`MongoCrudService` requires one and a second copy of the mutex package is
how you fail to share it.

## Migrations

The CLI under `src/migrations/cli.ts` is a workspace script, not a published
bin. Consumers call `migrate` or `MigrationRunner`:

```ts
import { migrate, MigrationRunner } from '@nxgt/shared-mongo';

await migrate('up', { migrationsDir: './migrations' });
await migrate('create', { migrationsDir: './migrations', create: { name: 'add-user-indexes' } });
```

Operations: `up`, `down`, `list`, `create`. `uri` overrides `MONGODB_URI`.
`up` / `down` accept `{ name, dryRun }`. The runner uses transactions, so the
URI must point at a replica set. A process-local mutex serialises concurrent
calls in one process; several processes need an external lock.

## Integrity

Register blockers under **`Model.modelName`**, never `Model.name`. Mongoose
sets `Model.name` to the string `"model"` for *every* model, so registering
under `.name` puts every blocker in the process under one key.

## Things that bite

- **Two filter DSLs, same names, incompatible meanings.** REST helpers live on
  the package root; the GraphQL ones live on `@nxgt/shared-mongo/filters`.
  `buildArrayFilter` is an exact match on one side and `$in` on the other.
  Import from the subpath when the input is GraphQL, from the root when it is
  REST query parameters. Do not merge them.
- **`clearDatabase()` is guarded** and refuses to run unless `NODE_ENV=test`
  and the database name ends in `-test`. Leave the guard alone; it has already
  stopped one production wipe.
- **`objectIdFromString` and `toObjectId`** are the same conversion under two
  names; one aliases the other. Both stay.
- **A list patch changes a path one way per update.** The operator builders
  `buildListStringPatch` and `buildListStringPatchUpdate` emit `$addToSet` for
  `add`, `$pullAll` for `remove` and a `$set` for `replace`. Any two on one
  path make MongoDB refuse the update (code 40, "Updating the path 'tags'
  would create a conflict at 'tags'"), so they throw a 400,
  `errors.list-patch-one-operation-per-path`, before any query. An empty
  array does not count. Send separate updates, or resolve the whole list and
  assign it:

  ```ts
  doc.tags = await resolveListStringPatch(doc.tags, Tag, { add, remove });
  await doc.save();
  ```

  The operator builders only work through `findOneAndUpdate` and friends:
  assigned onto a document and saved, `$addToSet` is dropped without a word.
