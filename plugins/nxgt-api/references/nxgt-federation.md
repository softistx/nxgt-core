# `build-a-graphql-yoga-api` in nxgt-federation

This is the only repository in the parc with an **Apollo Federation supergraph**,
so it is the only one where a GraphQL API can be something other than standalone.
Everything in the skill applies to both kinds; a subgraph is that shape plus four
deltas and one registration step.

Three APIs here: `apps/notes/notes-api` (standalone, Ory-native — the one to copy),
`apps/werewolf/werewolf-api` (standalone), and the subgraphs under
`apps/services/*` (`core`, `platform`, `users`, `locations`, `notifications`)
composed by `apps/supergraph`.

Two more standalone APIs left on 2026-09-22 and are still worth reading, at
`apps/api` in [softistx/self-learning](https://github.com/softistx/self-learning)
and [softistx/content-hub](https://github.com/softistx/content-hub).
`self-learning`'s is the worked example the skill points at.

## A subgraph differs in four places, and nowhere else

| | standalone | subgraph |
| --- | --- | --- |
| `graphql/schema.ts` | `createSchema` from `graphql-yoga`, with `SHARED_TYPE_DEFS` in the list | `buildSubgraphSchema([{ typeDefs, resolvers }])` from `@nxgt/shared-graphql`, **without** `SHARED_TYPE_DEFS` |
| `codegen.ts` | no `federation` key | `federation: true` |
| module SDL | no directives | `extend schema @link(...)`, `@key(fields: "id")` on owned types, stubs for external ones |
| `*.resolver.ts` | — | `__resolveReference`, and entity contribution blocks |

`federation: true` in a standalone app emits reference resolvers for types nothing
will ever resolve by reference; `createSchema` in a subgraph composes into the
supergraph as a subgraph with no entities. Both typecheck.

## Registering, which is the step with no compiler

1. Pick the next free port. `apps/supergraph/supergraph.yaml` is the registry —
   `users` 4000, `core` 4001, `locations` 4002, `notifications` 4003, and up.
2. Add the entry:
   ```yaml
   subgraphs:
     <name>:
       schema:
         subgraph_url: http://localhost:<port>/graphql
   ```
3. Recompose, because the gateway reads the composed file and not the services:
   ```sh
   cd apps/supergraph && rover supergraph compose --config ./supergraph.yaml > ./supergraph.graphql
   ```
   **Any** subgraph schema change needs this. A stale `supergraph.graphql` serves
   the old field list while every service is right.

A standalone API is **not** added to `supergraph.yaml`. That is the whole of its
registration.

## What stays in this repository's own skills

`.agents/skills/` (mirrored into `.claude/skills/` by symlink) keeps what only
exists where there is a supergraph, and it is deeper than this reference:

- **`create-subgraph-service`** — entity contributions (the stub, the `Omit` on the
  document type, the inline ID-projection resolvers), computed fields on an
  external stub with `createDataLoader` and an `isEqual` guard, and the FK naming
  rule: a foreign key is named after the **entity**, never with an `Id` suffix —
  `invoice`, not `invoiceId`, in the mongoose schema, the SDL and the types alike.
- **`refactor-subgraph-module`** and **`event-driven-patterns`** — unchanged, and
  not extractable: both are about the supergraph and the event bus behind it.
- **`create-standalone-ui-app`** — the SPA shape, superseded for new work by
  `nxgt-ory-app`'s `create-ory-native-ui`.

`create-standalone-graphql-api` was **removed on 2026-09-22**: its generic half is
now this skill plus `handle-a-file-upload`, and its auth half was already marked
superseded — a new API here resolves its caller with `useOryAuth`, not with
`stx-sdk`'s REST introspection.

## The subgraphs use the flat i18n layout, not the modular one

The skill's `resources/en/<module>.json` + `en/index.ts` shape is what the
standalone APIs here have. The subgraphs under `apps/services/*` have a single
`resources/en.json` and `fr.json`, one top-level camelCase key per module, merged
in `resources/index.ts`. Both are current; follow the one the service you are in
already uses, and prefer the modular shape for anything new — a per-module file is
what makes a module's keys removable with the module.

## Two facts about this repository that the skill's defaults assume

- **`apps/**` is two levels deep** (`apps/<product>/<product>-api`), so a root
  `--filter` glob must cover the extra level. A product that gets its own
  repository flattens to `apps/api` — see `nxgt-product`.
- **`@nxgt/*` comes from npmjs here**, not from a sibling checkout. A skill
  example showing `"@nxgt/shared-graphql": "workspace:*"` is stale: that form only
  ever worked while these packages lived in this tree.
