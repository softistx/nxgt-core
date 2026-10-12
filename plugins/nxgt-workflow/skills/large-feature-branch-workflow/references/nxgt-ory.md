# `large-feature-branch-workflow` in nxgt-ory

The common case here is **an effort that spans this repo and a consumer's**.
That is the one that most needs the discipline, because nothing enforces
agreement between the two halves.

## Green

`bun run check`, `bun run build`, `bun run typecheck`, `bun run test:packages`
and `bun run verify:artifacts`, plus `changeset:status` — what CI runs. Plus,
for anything touching `config/` or a flow, `bun run test` and
`cd kratos && bun run e2e`, which CI **cannot** run because they need a live
stack (and `ORY_LIVE=1 bun run test:packages` for the packages' live specs). `AGENTS.md` says why that is deliberate.

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
3. **The consumer repository's PR** — in the consumer monorepo or
   `nxgt-federation`, a separate branch and PR there, opened only once this
   repo's half is merged.
4. **Docs and skills last.**

**The cross-repo hop has no compiler, and here it is worse than usual.** A
consumer typechecks green against a stack that does not have your namespace,
and **Keto answers `false` — not an error — for a relation it does not know**,
so the consumer's tests read a missing namespace as a correct denial. The order
above is not negotiable, and the consumer's PR body should name this repo's PR.

`@nxgt/ory-sdk` and `@nxgt/ory-react` are workspace packages, published to npm
with changesets, and `kratos/` takes them at `workspace:^`: a slice that changes
one needs a changeset, and the app sees the change after `bun run build:packages`
and `rm -rf node_modules/.vite`, because it fails silently otherwise. Consumers
get it only once the Version PR is merged and the registry confirms the
publish, so a consumer slice waits for that. `@nxgt/material` is a published
dependency: a change there is built in its repository, **released**, and the
range bumped here. `stx-sdk` is no longer a dependency of this repository. Give
that propagation its own slice only when it involves real changes; otherwise it
is a step inside the slice that needed it.

There is also no builder base in that repo any longer — it existed only to carry
the `link:`ed packages, and `kratos/Dockerfile` builds from `oven/bun` directly.

## Deep review — the access surface here

First and above everything else, whether any slice widened it:

- a new `biome.json` exemption for `@nxgt/ory-sdk/admin` or `@nxgt/ory-sdk/tuples`;
- a console route outside `routes/admin/layout.tsx`;
- a guard moved into a loader;
- one of the three unauthenticated listeners (Kratos admin, Keto write, Hydra admin) becoming reachable from a browser
  or a traefik rule.

## Commit bodies

For a `config/` change, write the body in **consumer terms**: not "add
`Note#viewers`" but "federation's notes-api can now share a note with a group's
members". Those files have no other changelog, and the person who needs the
sentence is in another repository.

Types in use here: `feat`, `fix`, `update`, `chore`, `docs`.
