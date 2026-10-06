---
'@nxgt/shared-hono': patch
---

`rateLimiter` and `oryPrincipalFromMock` omit a key instead of passing `undefined` (`store`, `prefix`, `identity`, `clientId`, `name.first`, `name.last`). Every reader uses `?.` or a default, so behaviour is the same.

`gateway-trust` omits `call` when it is undefined.
