---
"@nxgt/security": minor
"@nxgt/shared-hono": minor
"@nxgt/shared-graphql": minor
---

Claims speak Kratos, from one mapper instead of two

`PolicyClaims` is now Kratos/OIDC-shaped. `kind`, `email`, `email_verified`,
`aal` and `aud` are first-class and documented — an Ory caller has carried them
all along, but they existed only through the index signature, so a rule could
read them and nothing said they were there. The oauth-api vocabulary
(`username`, `authorities`, `roles`, `permissions`, `uid`, `user`) stays and is
still checked by `checkAuthorities`, marked `@deprecated`: `apps/oauth` is being
retired in favour of Kratos/Hydra/Keto, and three rules documents in production
still name those fields. `user` went from `any` to `unknown`; nothing in the
parc reads it.

The new `@nxgt/security/integrations/ory` entrypoint exports
`claimsFromOryPrincipal`, and `oryAuth()` (Hono) and `useOryAuth()` (Yoga) both
call it. They used to build the object themselves, and had drifted: the REST one
wrote `exp` as an **ISO string** into a field declared `number`, so
`claims.exp < Date.now() / 1000` compared a string to a number and was false for
every value it could hold; the GraphQL one wrote seconds but dropped
`email_verified`, `aal` and `aud` entirely, so `expression: "claims.aal ===
'aal2'"` guarded a REST route and silently guarded nothing on a field. One
mapper is what stops that, the same way one `evaluateRequirement` stops the three
Keto vocabularies disagreeing.

`useOryAuth()` now puts `claims` on the GraphQL context beside `user`. That is
additive — `user` is unchanged, services read it — and it is what
`applyGraphqlPolicy`'s `getClaims` should return: `TokenPrincipal` has nowhere to
put `email_verified` or `aal`.

`policyGuard` also stopped logging every Ory-native decision against
"anonymous". It named the caller by `username` only, which an Ory caller does
not have; it now falls back to `sub`, then `clientId`.

Consumers: an Ory-native app that reads `claims.exp` gets a number where it got
a string. Nothing in the parc did. A GraphQL app can switch its `getClaims` from
`context.user` to `context.claims` to gain the four claims it was missing.
