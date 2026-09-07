---
'@nxgt/shared-hono': patch
---

Export `KetoChecker`, the type an app needs to hold the checker.

`useOry(ory)` puts a per-request Keto checker on the context, and the point of
it is that the app's own `<m>.access.ts` takes that checker rather than the
`ory` instance — which means the app has to name its type. `@nxgt/shared-graphql`
exported `KetoChecker` from the first release; this package only had the shape
inlined in its `ContextVariableMap`, so the symmetry the two integrations are
built on broke at the type level and a consumer had to hand-write the signature.

Same shape, now named once and used by the declaration too.
