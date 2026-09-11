---
name: keep-docs-current
description: >-
  After a change to a published package's public surface, keep the README (the
  npm page) developer-friendly: sections with a concise copy-paste example each,
  no private app names. Use when adding or changing an export, subpath, peer,
  shipped asset, or trap; when editing a package README; when asked if the docs
  are up to date; or when running /keep-docs-current.
---

# Skill: Keep package docs current

A change to a package is not done until its `README.md` still passes the bar
below. That file is the npm page, read by someone who has never seen this
repository and does not know the private applications that consume it.
`CHANGELOG.md` is generated; never edit it by hand.

## When

- A new or changed public export, subpath, peer, or shipped asset
  (`graphql/`, `openapi/`, `schema/`, `docs/` named in `files`).
- A trap that will fail a consumer at install, import, or first call.
- Explicitly: `/keep-docs-current`.

Not for a spec-only change, a private helper, or a comment.

## What to update

| Change | Also update |
| --- | --- |
| public API | that package's `README.md`, same PR |
| trap that cost more than an hour | `AGENTS.md`, same PR, in the section that owns it |
| how a *consumer* works | the consumer repo's `AGENTS.md`, in the consumer PR |
| a rule a future package must follow | the relevant skill |

Estate-specific names (`oauth-ui`, `kratos-ui`, a monorepo, "the parc")
belong in `AGENTS.md`. They do **not** belong on the npm page.

## README shape

The heading is the package name (`# @nxgt/<name>` or `# stx-sdk`). Then, in
this order:

1. **What it is** — one or two sentences a stranger on npmjs can use.
2. **Install** — `bun add <name>`, public registry. Required peers named as
   required, optional peers marked optional. One `bun add` block; do not
   repeat install later under "Consuming it".
3. **Setup** — anything that is not `import`: CSS `@source`, sprites, Vite
   `dedupe`, env. Each item is a snippet, then one sentence for why it exists.
4. **Subpaths** — a table that matches `exports`, minus `./package.json`.
   Omit only when `.` is the sole subpath.
5. **Usage** — one section per area a consumer actually starts from, each
   with **one copy-paste example**. A section with no snippet is an essay;
   cut it or add the snippet.
6. **Traps** — one sentence + the line that prevents it. Not a guided tour
   of `src/`.

Rules that decide tone:

- **The reader does not work here.** Never name a private application, a
  private monorepo, or "the parc" / "the estate" on the README. Write "an
  SSR app" not `kratos-ui`; write "the consumer" not `sellix-monorepo`.
- **Examples are the documentation.** Prefer 15 lines of working code over
  40 lines of prose.
- **Do not catalogue** every component or every type alias. Name the groups
  a caller imports (`*FormField`, `createOry`, `Map`) and show one of each.
- **Do not duplicate.** Install once. A trap that is already the Setup
  snippet does not also need a paragraph in Traps.

Patch changeset: the README ships.

## How

1. Make the code change.
2. Delegate to the `documentation-auditor` agent for the packages you touched.
3. Apply every `bug` gap in this PR. Suggestions too, unless they would invent
   a catalogue of unused type aliases.
4. Patch changeset if the README ships (it does).

Do not finish a package change with an auditor report still listing `bug`.
