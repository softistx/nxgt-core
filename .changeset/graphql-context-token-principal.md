---
"@nxgt/shared-graphql": minor
---

The GraphQL context carries a `TokenPrincipal`, not a `Principal`. This package
is nxgt-federation's alone — sellix-monorepo has no GraphQL — and what its
server puts in the context is a decoded JWT: `sub`, `uid`, `scope`. `Principal`
is the gateway-header shape, and after the merge it is the one the plain name
resolves to, so `GraphQLBaseContext`, `PrincipalContext`, the `extract-jwt`
plugin and the websocket context all promised a caller shape their own code
never produces. `ws-context.ts` gave it away: it reads `data.sub` and casts.
