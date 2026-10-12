---
"@nxgt/shared-hono": patch
---

`createErrorHandler` keeps the headers of an `HTTPException` thrown with a `res`. `basicAuth` and `bearerAuth` answered 401 without their `WWW-Authenticate` header, and a `Retry-After` or `Set-Cookie` put on the response was lost. The body stays the handler's JSON, so the headers describing the replaced body are not copied.
