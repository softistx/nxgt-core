---
'@nxgt/shared-mongo': patch
---

Fix the internal soft-delete plugin's `find` and `countDocuments` overrides (and their `…Deleted` variants) overwriting a `deleted` the caller's filter already named: `{ deleted: true }` or `{ deleted: { $exists: false } }` was replaced by the plugin's own condition. The two are now combined with `$and`, so the caller's condition applies and deleted documents are still excluded, as for `aggregate`. A filter that does not name `deleted` is unchanged. The plugin is internal — neither exported from the package nor part of `MONGOOSE_PLUGINS` — so no consumer reaches this through the public surface.
