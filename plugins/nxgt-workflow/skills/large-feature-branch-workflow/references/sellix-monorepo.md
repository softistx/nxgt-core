# `large-feature-branch-workflow` in sellix-monorepo

## Green

`bun run typecheck`, `bun run check` (biome), and the touched apps' own test
scripts. **Check each app's `package.json`** — do not assume a script exists
because another app in the monorepo has one; `apps/oauth/oauth-admin/AGENTS.md`
records that trap.

Route specs run **one file at a time, from inside the app directory**, against
`.env.test`, and you start no server yourself — a port collision with the
previous run fails all of them at ~0.1 ms and looks like a code defect.

## What counts as a contract

An OpenAPI change and the codegen it implies land in the same slice. A slice
must not leave `stx-sdk` or a client app typechecking against a contract that
no longer exists.

## Sequencing

1. **Backend and service-level fixes first** — the root-cause changes.
2. **OpenAPI contract changes next**, together with the fix that needed them,
   so codegen stays in sync within the slice.
3. **A dedicated sync slice** for propagation downstream. This repo has an
   extra hop: `apps/oauth/oauth-admin` (and less consistently
   `apps/oauth/oauth`) consume the sibling repository `stx-sdk` through
   `link:stx-sdk` / `bun link`, not as a workspace package. If a change touches
   an OpenAPI contract stx-sdk mirrors, that repo's `openapi/*.yaml` must be
   resynced and `bun run codegen && bun run build` run there — its `postbuild`
   re-runs `bun link` — before any client app sees it. The
   `ui-microservices-sync` skill has the full checklist.
4. **Shared-package changes are upstream**, in nxgt-core. See the main skill.
5. **Docs and skills last.**

Give the stx-sdk resync its own slice only when the propagation involves real
changes — client code adapting to a breaking contract. Pure propagation
(resync + build + typecheck, no files changed here) is a step inside the slice
that made the contract change.

## The base image

If a slice changes anything a `link:` package exposes, the builder base has to
be rebuilt before an app image will see it: `bun run docker:base`. It resolves
each linked repository's revision and rebuilds only when one moved.

## Deep review — the access surface here

Whether any slice widened what an unauthenticated or non-owner caller can
reach: a route that lost its `ketoCheck`, a service method reachable without
`require<M>Access`, an Oathkeeper rule in nxgt-ory that now matches more than
it did, or a `secured()` removed without the rules file gaining the equivalent.

## Example

The effort this workflow was written during — hardening
`apps/services/identity` + `apps/gateway` and propagating the contract to
`stx-sdk` and `apps/oauth/oauth-admin`:

```
develop
  └─ feature/identity-gateway-hardening   (integration branch)
       ├─ feat/igh-token-fixes            (auth bypass root cause)
       ├─ feat/igh-introspect-revoke      (endpoint hardening + dead code)
       ├─ feat/igh-gateway-config         (gateway robustness + config drift)
       └─ feat/igh-docs-skills            (skills + AGENTS.md)
```

Four slices, four PRs, all `--base feature/identity-gateway-hardening`, each
merged before the next was cut. Then
`review/identity-gateway-hardening-deep-audit`, then one PR to `develop`.
