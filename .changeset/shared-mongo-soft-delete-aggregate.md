---
'@nxgt/shared-mongo': patch
---

Make `aggregate`, `aggregateDeleted` and `aggregateWidthDeleted` work on a schema using the `softDelete` plugin. Their overrides pushed the caller's arguments onto the model instead of onto their own argument list, so every call threw `TypeError: Cannot assign to read only property 'length'` before reaching the server; and they read their arguments as one stage each (mongoose 4's shape), so even with the push fixed the caller's pipeline would have been dropped. They now take mongoose's `(pipeline, options)`: `aggregate` folds `deleted: { $ne: true }` into a leading `$match` or prepends one, `aggregateDeleted` does the same with `deleted: { $eq: true }`, and `aggregateWidthDeleted` passes the pipeline through unfiltered — it used to inject `$match: { deleted: undefined }`, which the driver sends as `null` and which would have excluded every document carrying a `deleted` field. The caller's pipeline array and stages are no longer mutated.
