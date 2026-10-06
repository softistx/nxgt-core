---
'@nxgt/shared-mongo': patch
---

Make the paginators' `deleted` option include deleted documents when asked to. This affects models that apply the soft-delete plugin, which the package does not export yet (it is neither exported nor in `MONGOOSE_PLUGINS`), so no consumer can reach this today.

The option was typed `'Deleted' | 'WidthDeleted'`, a misspelling: `paginate`, `paginateOffset` and `cursorPaginate` looked up `findWidthDeleted` and `countDocumentsWidthDeleted`, which the plugin never registered, and silently fell back to `find` and `countDocuments`, so `deleted: 'WidthDeleted'` returned only the documents that were *not* deleted. The option now accepts `'WithDeleted'`, matching the `findWithDeleted` / `countDocumentsWithDeleted` statics. `'WidthDeleted'` is still accepted and now behaves like `'WithDeleted'`, so a caller passing it will now also receive deleted documents, which is what the option asked for. It is deprecated, but only the exported `WidthDeleted` type name carries `@deprecated`: a `'WidthDeleted'` literal is accepted, not flagged by editors. The option's type is exported as `SoftDeleteScope`. The plugin also registers `aggregateWithDeleted`, the consistently named form of `aggregateWidthDeleted`, which remains as an alias.
