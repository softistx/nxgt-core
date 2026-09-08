---
---

Discontinue `@nxgt/edge`.

The package is deleted, not deprecated in place: nothing in the parc consumes
it any more. Its only consumer was `nxgt-ory`'s `edge/` service, which has been
removed along with its two config documents and its signing key. `0.2.0` stays
on npmjs — it is past the 72-hour unpublish window — and is marked deprecated
there, pointing at what replaces it.

Nothing replaces it as a *component*. An Ory-native API authorizes itself, in
process, with what these packages already ship: `oryAuth()` + `oryChecks()` +
`ketoCheck()` from `@nxgt/shared-hono` for REST, and `useOryAuth()` +
`useKetoChecks()` with the `@check` directive from `@nxgt/shared-graphql` for
GraphQL. Both walk the same `evaluateRequirement` from `stx-sdk/ory` as the
`keto` terms in a `rules.yaml`, so the three ways of saying a permission cannot
come to disagree.

An empty changeset: no published package changes version. `@nxgt/security`,
`@nxgt/shared-hono` and `@nxgt/shared-graphql` are untouched — the edge
depended on them, not the other way round.
