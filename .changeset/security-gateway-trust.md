---
'@nxgt/security': minor
'@nxgt/shared-graphql': patch
---

`@nxgt/security/gateway`: `gatewaySecret`, `requireGatewayTrust`, `assertGatewaySecret`, `GATEWAY_SECRET_HEADER` and the `GatewayTrust` types — the one definition of "which gateway may name the caller", which `@nxgt/shared-graphql` and `@nxgt/shared-hono` both re-export, so a gateway's secret means the same thing to a REST and a GraphQL service. The subpath imports nothing.

`@nxgt/shared-graphql` now re-exports it rather than carrying its own copy. Its exports, their behaviour and their error messages are unchanged.
