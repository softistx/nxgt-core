---
name: keep-docs-current
description: >-
  After a change to an @nxgt/* public surface, keep the package README (the
  npm page) complete: what it is, install, subpaths, usage, traps. Use when
  adding or changing an export, subpath, peer, shipped asset, or trap; when
  editing packages/*/src or packages/*/package.json; when asked if the docs
  are up to date; or when running /keep-docs-current.
---

# Skill: Keep package docs current

A change to a package is not done until its `README.md` still passes the
README test in `AGENTS.md`. That file is the npm page. `CHANGELOG.md` is
generated; never edit it by hand.

## When

- A new or changed public export, subpath, peer, or shipped asset
  (`graphql/`, `openapi/`, `schema/` named in `files`).
- A trap that will fail a consumer at install, import, or first call.
- Explicitly: `/keep-docs-current`.

Not for a spec-only change, a private helper, or a comment.

## What to update

The table in `release-a-package-change` is the index. Short form:

| Change | Also update |
| --- | --- |
| public API | that package's `README.md`, same PR |
| trap that cost more than an hour | `AGENTS.md`, same PR, in the section that owns it |
| how a *consumer* works | the consumer repo's `AGENTS.md`, in the consumer PR |
| a rule a future package must follow | the relevant skill |

## README shape

Match the pages already in `packages/*/README.md`:

1. What it is
2. Install (`bun add`, public npmjs, `typescript` `^6.0.3`; name a required peer as required)
3. Subpaths table matching `exports` (omit only when `.` is the only one)
4. Usage / public API
5. Things that bite

The heading is `# @nxgt/<name>`.

## How

1. Make the code change.
2. Delegate to the `documentation-auditor` agent for the packages you touched.
3. Apply every `bug` gap in this PR. Suggestions too, unless they would invent
   a catalogue of unused type aliases.
4. Patch changeset if the README ships (it does).

Do not finish a package change with an auditor report still listing `bug`.
