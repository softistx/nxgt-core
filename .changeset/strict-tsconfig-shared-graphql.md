---
'@nxgt/shared-graphql': patch
---

`useOryAuth()` and `useAuth()` still write `user`, `claims` and `token` as explicit keys, `undefined` included, so a request with no credential clears a `user`, `claims` or `token` the app's context factory set (Envelop merges `extendContext` with `Object.assign`, and Yoga runs the context factory before plugins). To allow that under `exactOptionalPropertyTypes`, `GraphQLBaseContext`, `PrincipalContext`, `OryContext#claims` and `resolveOryPrincipal`'s result now type `user`, `claims` and `token` as `T | undefined`, a widening no consumer breaks on.
