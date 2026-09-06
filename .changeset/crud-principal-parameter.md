---
'@nxgt/shared-mongo': minor
---

Let a service say which principal shape it is given.

`MongoCrudService` hard-coded `Principal`, the caller as the gateway's
`X-User-*` headers describe them. federation's services are handed
`TokenPrincipal`, the caller as the access token describes them, and read `uid`
and `sub` off it — fields `Principal` does not have. The two shapes were kept
side by side on purpose during the merge; the constructor quietly picked one.

It now takes a fourth type parameter, `P extends Principal | TokenPrincipal`,
defaulting to `Principal` so nothing that compiles today changes.
