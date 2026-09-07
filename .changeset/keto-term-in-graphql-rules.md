---
'@nxgt/security': major
---

The `keto` term on the GraphQL side, and one wrapper that stops dropping decisions

A GraphQL rule now carries a `keto` list, the declarative statement of what the
`@check` directive says on a field: rungs, denials and i18n keys, `view` then
`edit`. Ids are read from `args.<path>` or `source.<path>` — `source.` being how
a field on a returned type names its object, e.g. `User.email` guarded by
`source.id`.

The field is declared per transport rather than on the shared rule entry,
because only the id grammar differs and it differs in a way the schema must
enforce: written once, REST's `param.id` would be accepted under `graphql:`,
autocompleted, and then resolve nothing at request time. Rule entries on both
sides are now `.strict()`.

Everything else is shared in code — `evaluateKetoRungs` walks the rungs,
short-circuits and maps denials for both evaluators, over the one
`evaluateRequirement` from `stx-sdk/ory`.

**Breaking:** `evaluateGraphql` is now `async`, like `evaluateRest`. Callers
using `applyGraphqlPolicy` need no code change.

**Breaking, and a fix:** `applyGraphqlPolicy` branched on `DENY` alone, so a
field under a rule `evaluateRest` answers 401 for let an anonymous caller
straight to its resolver — the same rule, two answers depending on transport.
It now throws `UNAUTHENTICATED` for a caller the floor turned away, and carries
a Keto rung's code and message onto the `GraphQLError`.

`stx-sdk` stays an optional peer: the new
`@nxgt/security/integrations/graphql/keto` entrypoint is the only module on this
side that imports it.
