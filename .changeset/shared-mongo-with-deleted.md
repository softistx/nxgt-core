---
'@nxgt/shared-mongo': patch
---

Make the paginators' `deleted` option include deleted documents when asked to. It was typed `'Deleted' | 'WidthDeleted'`, a misspelling: `paginate`, `paginateOffset` and `cursorPaginate` looked up `findWidthDeleted` and `countDocumentsWidthDeleted`, which the `softDelete` plugin never registered, and silently fell back to `find` and `countDocuments` — so `deleted: 'WidthDeleted'` returned only the documents that were *not* deleted. The option now accepts `'WithDeleted'`, matching the `findWithDeleted` / `countDocumentsWithDeleted` statics, and still accepts `'WidthDeleted'` as a deprecated alias that behaves like `'WithDeleted'`; both are exported as `SoftDeleteScope`. A caller already passing `'WidthDeleted'` will now receive deleted documents too, which is what the option asked for. The `softDelete` plugin also registers `aggregateWithDeleted`, the consistently named form of `aggregateWidthDeleted`, which remains as an alias.
