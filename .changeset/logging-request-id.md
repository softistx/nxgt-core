---
'@nxgt/shared-logging': patch
---

`loggerProvider()` now puts the request-scoped child logger on the Hono context instead of building it and discarding it, and the line format prints `[requestId=<id>]` after the level when the logger carries one. Lines without a `requestId` are byte-identical to before.
