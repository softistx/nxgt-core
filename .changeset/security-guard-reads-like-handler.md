---
"@nxgt/security": patch
---

`policyGuard` reads `req.query` and `req.cookies` through `c.req.query()` and `getCookie()`, as the handler does — first value of a repeated name, decoded, cookie quotes stripped — and detects a JSON body as Hono's validator does (`application/json` or `application/<x>+json`, any case).
