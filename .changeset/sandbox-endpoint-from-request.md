---
"@nxgt/shared-graphql": minor
---

`sandboxExplorer` starts Apollo Sandbox at the GraphQL endpoint of the server that served the page — the request's own origin — when neither `port`, `hostname` nor `protocol` pins it, instead of `http://localhost:8080/graphql`. A new `initialEndpoint` option sets the whole URL. `createYogaHono` points it at `yoga.graphqlEndpoint`, and a leading slash in `graphqlEndpoint` no longer doubles.
