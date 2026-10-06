---
"@nxgt/shared-hono": patch
---

Security: `secured()` no longer lets a confidential client (a `clientId` and no `username`) through on `roles: ['ADMIN']`. The ADMIN-role bypass ran before the client check, so a client principal carrying that role passed every guard without the `SCOPE_*` authority the guard asked for — contrary to the guard's own documentation. A confidential client is now held to its `SCOPE_*` authorities only, ADMIN role or not. Users keep the ADMIN bypass unchanged. A client that relied on the role needs the scope the route names.
