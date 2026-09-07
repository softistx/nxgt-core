# `large-feature-branch-workflow` in nxgt-federation

## Green

`bun run build`, `bun run typecheck`, `bun run check`, and the app's specs —
plus codegen if a schema changed. Composition must succeed: a slice that leaves
the supergraph failing is not green, however green its own app is.

**Specs are `*.spec.ts`, auto-discovered by bun, with no `test` script.** A
directory search for `*.test.ts` or a missing `test` script is not evidence
that a project has no test infrastructure — `AGENTS.md`'s Testing section and
`create-standalone-graphql-api`'s say so. Run them **from inside the app
directory** (`cd apps/<…> && NODE_ENV=test bun test src`), because Bun loads
`.env.test` from the working directory, not from the path given to the runner.

E2E gates on `--project=chromium`; the all-browser run fails on `develop` too.
An unmocked request in a Playwright run is not a failed request — MSW passes it
through to the real backend.

## What counts as a contract

A schema change and the generated types it implies belong in the same branch.

## Sequencing

Start with a **scaffold slice** whenever several later slices will touch the
same shared wiring. The scaffold slice:

- creates the directory structure and minimal barrels so the app still
  compiles;
- wires the still-empty scope into every shared aggregator **once** — module
  registry (`src/modules/index.ts`), the i18n resource index, `codegen.ts` if
  applicable;
- leaves every later slice free to add files inside its own module folder and
  touch no shared file at all.

Then module slices in dependency order, then integration, then docs.

**Write the tests, do not just run the ones that exist.** Every slice that adds
a service adds that service's `<name>.service.spec.ts` in the same PR. Do not
defer test-writing to a final `-integration` slice.

## Deep review — the access surface here

Whether any slice widened what an unauthenticated or non-owner caller can
reach: a field that lost its `@authenticated` or `@check`, a resolver reaching
data without `require<M>Access`, or a subgraph exposing something the supergraph
was not meant to compose.

## Example

A new `project-management` module (projects/boards/sprints/tasks):

```
develop
  └─ feat/project-management         (integration branch)
       ├─ feat/pm-scaffold           (module dirs + shared wiring)
       ├─ feat/pm-projects           (projects + project-members)
       ├─ feat/pm-boards             (boards + board-statuses)
       ├─ feat/pm-sprints            (sprints)
       ├─ feat/pm-tasks              (tasks core entity)
       ├─ feat/pm-tasks-collab       (comments/worklogs/watchers/attachments)
       ├─ feat/pm-notifications      (event-driven notification wiring)
       └─ feat/pm-integration        (end-to-end tests, final hardening)
```

"End-to-end tests" in the last slice is a literal deliverable: one
`<scope>.integration.spec.ts` instantiating every service in the effort and
driving a realistic workflow through them, plus a cascades/blockers test.
"Final hardening" is a review pass for gaps the per-slice specs missed — it
supplements the integration spec rather than replacing it.

This applies at whole-app scale too. `self-learning-api` and `content-hub-api`
were each scaffolded this way, under a `feature/<slug>` integration branch,
each paired with a sibling UI effort built the same way.
