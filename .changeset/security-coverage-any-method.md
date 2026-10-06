---
"@nxgt/security": patch
---

`unnamedOperations` reports an `ALL` route on an exact path (`app.all('/doc', …)`) unless every method the rules schema knows is named for it. A middleware mounted on an exact path in front of a later route on that path (`app.use('/doc', mw)` then `app.get('/doc', …)`) is still skipped, as is `ALL` on a wildcard path. `OperationRef` takes an optional `handler`, which a Hono `app.routes` entry already carries.
