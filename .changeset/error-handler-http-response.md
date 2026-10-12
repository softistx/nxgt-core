---
"@nxgt/shared-hono": patch
---

`createErrorHandler` keeps the headers of an `HTTPException` thrown with a `res`. `basicAuth` and `bearerAuth` answered 401 without their `WWW-Authenticate` header, and a `Retry-After` or `Set-Cookie` put on the response was lost. The body stays the handler's JSON, so the headers describing the replaced body, and the hop-by-hop ones, are not copied. A browser calling a `basicAuth` route now receives `WWW-Authenticate: Basic` on a 401, which can open its login dialog.
