# `large-feature-branch-workflow` in nxgt-ory

The common case here is **an effort that spans this repo and a consumer's**.
That is the one that most needs the discipline, because nothing enforces
agreement between the two halves.

## Green

`bun run check`, `bun run typecheck` and `bun run build` — what CI runs. Plus,
for anything touching `config/` or a flow, `bun run test` and
`cd kratos && bun run e2e`, which CI **cannot** run because they need a live
stack. `AGENTS.md` says why that is deliberate.

Bring the stack up with `bun run setup` (idempotent; `bun run setup keto` for a
subset).

## What counts as a contract

`config/` is the contract. A namespace, an access rule or an identity schema is
consumed by another repository that has no way to check it.

## Sequencing

`config/` is upstream of everything, so the order is nearly always:

1. **`config/` first**, in its own slice, with the restart and the syntax check
   done and stated in the commit. Load `change-stack-config` for it.
2. **The console or the flow routes** that consume it, here.
3. **The consumer repository's PR** — in `sellix-monorepo` or
   `nxgt-federation`, a separate branch and PR there, opened only once this
   repo's half is merged.
4. **Docs and skills last.**

**The cross-repo hop has no compiler, and here it is worse than usual.** A
consumer typechecks green against a stack that does not have your namespace,
and **Keto answers `false` — not an error — for a relation it does not know**,
so the consumer's tests read a missing namespace as a correct denial. The order
above is not negotiable, and the consumer's PR body should name this repo's PR.

`stx-sdk` and `@nxgt/material` arrive by `link:`, not as workspace packages. If
a slice needs a change in either, build it there (`bun run build`) and
`rm -rf node_modules/.vite` here before the dev server sees it — it fails
silently otherwise. Give that its own slice only when the propagation involves
real changes; otherwise it is a step inside the slice that needed it.

## Deep review — the access surface here

First and above everything else, whether any slice widened it:

- a new `biome.json` exemption for `stx-sdk/ory/admin` or `stx-sdk/ory/tuples`;
- a console route outside `routes/admin/layout.tsx`;
- a guard moved into a loader;
- one of the four unauthenticated listeners becoming reachable from a browser
  or a traefik rule.

## Commit bodies

For a `config/` change, write the body in **consumer terms**: not "add
`Note#viewers`" but "federation's notes-api can now share a note with a group's
members". Those files have no other changelog, and the person who needs the
sentence is in another repository.

Types in use here: `feat`, `fix`, `update`, `chore`, `docs`.
