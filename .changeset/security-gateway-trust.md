---
'@nxgt/security': minor
'@nxgt/shared-graphql': patch
---

`@nxgt/security/gateway`: `gatewaySecret`, `requireGatewayTrust`, `assertGatewaySecret`, `GATEWAY_SECRET_HEADER` and the `GatewayTrust` types — the one definition of "which gateway may name the caller". `@nxgt/shared-graphql` and `@nxgt/shared-hono` both re-export `gatewaySecret`, `GATEWAY_SECRET_HEADER` and the types, and each wraps `requireGatewayTrust` in a `requireGatewayTrust(options, caller)` of its own, so a gateway's secret means the same thing to a REST and a GraphQL service. The subpath imports nothing.

`@nxgt/shared-graphql` now re-exports it rather than carrying its own copy. Its exports, their behaviour and their error messages are unchanged.
