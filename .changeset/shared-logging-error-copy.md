---
"@nxgt/shared-logging": patch
---

`logger.error(error)` no longer rewrites the error's `message` with colour escape codes, and no longer throws `Attempted to assign to readonly property.` for an error whose `message` is read-only, such as the `DOMException` of an aborted fetch: the logged line is a copy of the error. The printed line is unchanged.
