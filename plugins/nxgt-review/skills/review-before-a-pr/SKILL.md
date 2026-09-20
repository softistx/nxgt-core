---
name: review-before-a-pr
description: >-
  Run the read-only code-reviewer agent on a branch before opening its pull
  request, apply what it finds, and state in the PR what was and was not
  checked. Use when a slice or a fix is done and about to be pushed, when a
  PR into develop is being prepared, when asked to review a branch or check
  the state of a package or an app, or when running /review-before-a-pr.
---

# Skill: Review before a pull request

The `code-reviewer` agent reads the diff against the repository's own
`AGENTS.md` and the reference for that repository in this plugin's
`references/`, measures before it judges, and reports. It never edits. This
skill is the loop around it.

## When

- A slice is done and green, before `gh pr create`.
- The integration branch is about to PR into `develop` — review the whole
  effort once more, since slices were reviewed one at a time.
- Asked to review a branch, a package or an app.

Not for a one-line typo, a changeset-only change, or a Version PR.

## How

1. Make the green bar pass first. A review of a red branch reports the red
   and nothing else useful.
2. Delegate to the `code-reviewer` agent. Name the scope — "the branch
   against `origin/develop`", "the diff since `<sha>`", "`packages/<name>`".
   For an effort, give it the integration branch and say which slice is new.
3. In parallel, when a public surface changed, delegate to
   `documentation-auditor` (plugin `nxgt-docs`). The reviewer does not audit
   documentation.
4. Apply every finding that breaks an invariant, a layering rule or a
   packaging rule, in this branch. Apply structural findings too, unless the
   split is a change of its own — then say so in the PR and open a follow-up.
5. Re-run the green bar, then the reviewer on what changed, until it reports
   `ready: true`.
6. In the PR description, add a short **Review** section: what the reviewer
   checked, what it did not (suites not run and why), and any finding left
   open with its reason.

## Disagreeing with a finding

The reviewer argues from `AGENTS.md`. When it is wrong, it is usually
because the reference in `references/<repo>.md` has gone stale against
`AGENTS.md` — fix the reference here, in nxgt-core, with a version bump of
`nxgt-review`. When the rule itself is wrong, change `AGENTS.md` in its own
repository first; the reference follows.

## Adding a repository

A new repository gets `references/<repo>.md`, in the shape of the others:
what it is, **Measure** (the commands for its layout, the green bar, what
the reviewer may and may not run), **Invariants**, **Deliberate — do not
report**, **Layering and packaging**. Only rules its `AGENTS.md` states.
Then it enables `nxgt-review@nxgt-core` in its `.claude/settings.json`, and
deletes any local `.claude/agents/code-reviewer.md`, so there is one
reviewer rather than two copies drifting apart.
