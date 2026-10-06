---
'@nxgt/shared-mongo': patch
---

Fix the statics of the soft-delete plugin. This affects models that apply the soft-delete plugin, which the package does not export yet (it is neither exported nor in `MONGOOSE_PLUGINS`), so no consumer can reach these today.

- `aggregate`, `aggregateDeleted` and `aggregateWidthDeleted` no longer throw. Their overrides pushed the caller's arguments onto the model instead of onto their own argument list, so every call threw `TypeError: Cannot assign to read only property 'length'` before reaching the server, and they read their arguments as one stage each (mongoose 4's shape), so the caller's pipeline would have been dropped even with the push fixed. They now take mongoose's `(pipeline, options)`.
- `aggregate` adds `$match: { deleted: { $ne: true } }` and `aggregateDeleted` adds `$match: { deleted: { $eq: true } }` at the head of the pipeline, or right after a stage that must stay first (`$geoNear`, `$search`, `$searchMeta`, `$vectorSearch`). The condition is folded into a `$match` already in that place unless that one names `deleted`, in which case it goes in as a separate stage: a caller's own condition on `deleted` is kept, not overwritten. The caller's pipeline array and stages are no longer mutated.
- `aggregateWidthDeleted` passes the pipeline through unfiltered. It used to inject `$match: { deleted: undefined }`, which the driver sends as `null` and which would have excluded every document carrying a `deleted` field.
- **Behaviour change:** `findDeleted` and `countDocumentsDeleted` now return and count the deleted documents only. They built the `deleted: true` filter and then passed the caller's original arguments instead, so they returned and counted every document matching the caller's filter, deleted or not.
