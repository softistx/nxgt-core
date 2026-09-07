---
name: large-feature-branch-workflow
description: >-
  Split an effort too large for one branch into slices that are each reviewed
  and green on their own, collect them on one integration branch, and land the
  whole thing on `develop` as a single reviewable unit. Use when the work spans
  several apps, services or repositories, splits into chunks with a dependency
  order, or will take more than one session. Not for a normal fix or a
  one-module change.
---

# Skill: Large feature branch workflow

## Purpose

Some efforts are too large to land in one branch and one PR: several slices
with a dependency order, work spanning more than one session, or a change that
crosses repository boundaries. This splits the effort into slices that are each
green on their own, collects them on one integration branch, and lands the
whole thing on `develop` as one reviewable unit — rather than accumulating
behind a long-lived branch nobody reads until the end, or dribbling half an
effort onto `develop`.

Do **not** use it for a normal bug fix or a single-module change. Those are
already one branch and one PR, and a plan would cost more than it saves.

The shape is the same in `sellix-monorepo`, `nxgt-federation`, `nxgt-ory` and
`stx-sdk`, so an effort that touches two of them uses the same structure in
each. What differs per repository — the green bar, the sequencing, the review
axes — is in `references/`; **read the one for the repository you are in**
before drawing the slices.

## When to use

- The change spans multiple apps, services, or **two repositories** — a
  contract plus its consumers, a shared package plus what imports it, a stack
  config entry plus the app that uses it.
- The work splits into independently reviewable chunks with a dependency order.
- It will take several sessions, and each chunk should be merged and green
  before the next starts.

---

## Structure

```
develop
  └─ feat/<slug>                   ← integration branch, off develop
       ├─ feat/<slug>-<slice-1>    ← off feat/<slug>, PR → feat/<slug>, merged before the next
       ├─ feat/<slug>-<slice-2>    ← off the feat/<slug> that already carries slice 1
       └─ feat/<slug>-<slice-N>
```

1. **Cut the integration branch first**: `git checkout develop && git pull
   --ff-only && git checkout -b feat/<slug>`, and push it so slice PRs have a
   base.
2. **Slices are `feat/<slug>-<slice>`**, off the integration branch. Use
   `fix/<slug>-<slice>` when a slice repairs something an earlier slice of the
   same effort introduced.
3. **Every slice PR targets the integration branch**: `gh pr create --base
   feat/<slug>`. Pass `--base` explicitly — the repository default is
   `develop`, and a slice that lands there by accident has skipped the whole
   point. A slice never PRs into another slice.
4. **The integration branch is the only thing that PRs into `develop`**, once
   every slice is merged and the effort is green. Say so and wait for a
   go-ahead before merging it: that PR *is* the effort, and it is the one a
   human reads.
5. **`develop` is the terminus.** Nothing here targets `main`, and finishing an
   effort does not touch it — `main` is aligned from `develop` separately
   (`git checkout main && git merge develop`), when someone asks.
6. **Merge each slice before cutting the next**, so the next starts from an
   integration branch that carries the last one. This is what keeps the
   ordering honest: there is nothing to rebase, and no window where two
   branches disagree.

---

## Every slice leaves the integration branch green

This is the rule that makes the rest work. A slice merges before the effort is
finished, so the integration branch must be clean at every step and the next
slice must start from something that works.

- **New capability lands dark.** Something that exists, compiles and is
  registered but that nothing reaches yet is a fine intermediate state; a
  half-wired one is not. Turn it on in the slice that wires it up.
- **No slice leaves a dangling reference** — no import of a type the next slice
  will add, no caller of something not deployed yet, no test skipped "until
  later".
- **A contract change and its consumers stay consistent within a slice.** What
  counts as a contract differs per repository; the reference file says.
- **A slice that cannot land green is drawn wrong.** Redraw it — usually by
  splitting the contract change from the consumer migration, with a compatible
  window in between — rather than letting the integration branch sit red.
- **Regression-test the actual bug** when a slice fixes a bypass or a
  correctness error: a test that fails against the old code and passes against
  the new one, not manual verification. Even where the surrounding area has
  little coverage.

**What "green" means is per-repository** — the exact commands are in the
reference file, and they are not the same set everywhere. Check the app's own
`package.json` rather than assuming a script exists because a sibling has one.

The *deployable* bar — that `develop` could be shipped as it stands — is what
the **integration PR** clears, not each slice. That is the whole reason the
integration branch exists: an effort can be assembled across several green
steps without any half-finished step reaching `develop`.

---

## Sequencing slices

Order slices by dependency. Two rules hold in every repository; the rest is in
the reference file.

**A change to a shared package is a slice in another repository, and it comes
first.** The `@nxgt/*` packages live in
[nxgt-core](https://github.com/softistx/nxgt-core) and install from npmjs. Land
the change there, let its Version PR merge and publish, wait for the version to
answer 200 on `registry.npmjs.org` — the CDN lags the publish by about a minute
— then bump the range here, in the slice that needs it. A slice that assumes an
unpublished version is not reviewable and cannot be green. Load
`release-a-package-change` for that half.

**Docs and skills last**, once the behaviour is settled.

**A cross-repository hop has no compiler.** Nothing checks that the two halves
agree: the consumer typechecks green against a version or a stack that does not
have your change yet, and the failure surfaces as a wrong answer rather than an
error. That is why the order is not negotiable, and why the consumer's PR body
should name the upstream PR.

---

## Deep review before the `develop` PR

Each PR verifies its own slice is green and internally consistent. That is not
a review of the whole. When slices are built one at a time — often by
independent agents with no visibility into their siblings — cross-slice
duplication, inconsistent conventions and one-off deviations are the expected
outcome, not the edge case. Do this for every effort built this way, not only
when something looks wrong.

- **When**: after the last slice merges into the integration branch and
  **before** the PR to `develop` opens, so a finding can still land as one more
  slice instead of as a follow-up on `develop`.
- **Where**: a fresh branch off the integration branch,
  `review/<slug>-deep-audit`. It is for the review; it normally produces a
  report, not code.
- **How**: split it rather than making one sequential pass — an effort large
  enough for this workflow is large enough that a single reviewer skims. One
  agent per domain or module group, however the slices were split, **plus one
  scoped to the shared and cross-cutting files and to cross-slice duplication**.
  That last one is the perspective no single-domain reviewer has, because it
  means comparing what several independent agents each did for the same class
  of problem. Give every agent the same context and an explicit instruction
  that this is a read-only investigation.
- **What to look at**: bugs, tech debt, duplication, cross-app consistency, and
  — first — whether any slice widened the access surface. The repository's
  reference file names what that means concretely there.
- **Output**: a findings report — file path, one-line summary, severity — not
  edits. Report by default and let the user decide what to act on; fix inline
  on the review branch only if they asked for that up front.

---

## Commit messages

`<type>: <Capitalized summary>`, matching what `git log` already shows. Types:
`feat`, `fix`, `update`, `chore`, `docs`, `refactor`, `tests`, `styles`,
`typo`.

Write the body for whoever has to act on it. When a change is consumed from
another repository, that means **consumer terms**: not "add `Note#viewers`" but
"federation's notes-api can now share a note with a group's members". Those
changes often have no other changelog, and the person who needs the sentence is
somewhere else.

---

## Per-repository specifics

| repository | file |
| --- | --- |
| `sellix-monorepo` | `references/sellix-monorepo.md` |
| `nxgt-federation` | `references/nxgt-federation.md` |
| `nxgt-ory` | `references/nxgt-ory.md` |
| `nxgt-core` | `references/nxgt-core.md` |

Read the one you are in. It carries that repository's green bar, its sequencing
order, the propagation hops it has, and the access surface its deep review must
check.
