---
'@nxgt/security': major
---

Ask Keto from a rules file: the `keto` term, and an async `evaluateRest`

`authorities` asks what a caller carries. It cannot ask what an Ory-native API
needs to know — may this caller `view` `Bookmark:b1` — a question about one
object. A REST rule can now carry a `keto` list, in the same `[[A, B], [C]]`
grammar as the `@check` directive and `ketoCheck()`, each rung with its own
`onDeny` and `message`. Two rungs, `view` then `edit`, is the 404-then-403
ladder, written where the rest of the route's policy already lives.

The DNF walk is `evaluateRequirement` from `stx-sdk/ory`, not a copy, so the
rules file and the two existing mechanisms cannot come to disagree.

**Breaking:** `evaluateRest` is now `async` — a Keto term is a remote question.
Callers using `policyGuard` need no code change, only the version.
`evaluateGraphql` stays synchronous and accepts no Keto term.

`EvaluateResult` grows two optional fields, `denial` and `message`, set only by
a Keto rung; every refusal that existed before keeps answering exactly what it
did. GraphQL rule entries are now `.strict()`, so a REST-only key that wanders
into one fails at startup instead of being stripped in silence.

`stx-sdk` is a new **optional** peer dependency, imported only by the new
`@nxgt/security/integrations/hono/keto` entrypoint — a service with no `keto`
term never resolves it.

The generated JSON Schema moves to `schema/rules.schema.json` and is now in
`files`, so it ships. Rules files point their `# yaml-language-server:
$schema=` pragma at `node_modules/@nxgt/security/schema/rules.schema.json`.
While this package lived inside the consuming monorepo those pragmas pointed
at its source tree; after the extraction to nxgt-core they resolved to
nothing, and the completion they exist for had been silently gone from three
production rules files.
