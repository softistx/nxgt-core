---
name: keep-docs-current
description: >-
  After a change to a published package's public surface, keep its docs
  developer-friendly: the README (the npm page) with a concise copy-paste
  example per section, and the package's docs/ folder — detailed guides with
  examples, troubleshooting, roadmap — with no private app names anywhere.
  Use when adding or changing an export, subpath, peer, shipped asset, error,
  or trap; when editing a README or anything under docs/; when asked if the
  docs are up to date; or when running /keep-docs-current.
---

# Skill: Keep package docs current

A change to a package is not done until its `README.md` and its `docs/` folder
still pass the bar below. Both are published: the README is the npm page, and
`docs/` ships in the tarball and is linked from it. Both are read by someone
who has never seen this repository and does not know the private applications
that consume it. `CHANGELOG.md` is generated; never edit it by hand.

The README is the short version. `docs/` is the long one — the place for the
detail, the second and third example, the error a consumer will paste into a
search box, and what is coming next.

## When

- A new or changed public export, subpath, peer, or shipped asset
  (`graphql/`, `openapi/`, `schema/`, `docs/` named in `files`).
- A trap that will fail a consumer at install, import, or first call.
- A new or changed error a consumer can see (message, code, class).
- Work planned, started, shipped, or dropped for the package.
- Explicitly: `/keep-docs-current`.

Not for a spec-only change, a private helper, or a comment.

## What to update

| Change | Also update |
| --- | --- |
| public API | that package's `README.md` and the `docs/guide/` page for that area, same PR |
| an error a consumer can see | `docs/troubleshooting.md`, same PR |
| work planned, shipped, or dropped | `docs/roadmap.md`, same PR |
| trap that cost more than an hour | `AGENTS.md`, same PR, in the section that owns it |
| how a *consumer* works | the consumer repo's `AGENTS.md`, in the consumer PR |
| a rule a future package must follow | the relevant skill |

Estate-specific names (`oauth-ui`, `kratos-ui`, a monorepo, "the parc")
belong in `AGENTS.md`. They do **not** belong on the npm page, nor in `docs/`.

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
   of `src/`. The full symptom and fix live in `docs/troubleshooting.md`.
7. **Documentation** — one line per page of `docs/`: the guide index,
   troubleshooting, roadmap. Relative links (`docs/troubleshooting.md`);
   npm resolves them through `repository.directory`.

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

## The `docs/` folder

```
packages/<name>/docs/
  README.md             ← the index: one table, "Page | Read it when"
  guide/
    <area>.md           ← one page per area a consumer starts from
  troubleshooting.md
  roadmap.md
```

`docs` must be named in `files`, or none of it ships:

```jsonc
"files": ["dist", "docs", "README.md", "package.json", "LICENSE"]
```

A package whose whole surface fits in the README still has
`troubleshooting.md` and `roadmap.md`; `guide/` starts when one area needs
more than the README's one example.

### Guide pages — detail, with examples

The README shows *that* it works; a guide page shows *how*, for one area.

- **Open with what the page is for**, in one sentence, then the smallest
  complete example — imports included, runnable as pasted.
- **Then the detail, each point with its snippet**: every option that
  changes behaviour, the defaults, what is returned, what is thrown. A
  table for options (`Option | Type | Default | Effect`), a snippet for
  each non-obvious one.
- **Show the realistic case**, not only the toy: a second example wiring
  the area into a Hono app, a Mongo model, a test — whatever a consumer
  actually does next.
- **Types are shown, not described**: a `ts` block with the signature beats
  a paragraph about it.
- **Every example compiles** against the current exports. An import that no
  longer resolves is a bug, not a stale sentence.
- Link to a sibling page rather than repeating it. `packages/*/docs/` in
  `softistx/nxgt-http` (`@nxgt/openapi-codegen`) is the reference layout.

### `troubleshooting.md` — symptom first

A consumer arrives here with an error message, so the error message is the
heading. One entry per problem:

````md
## `ReferenceError: mongoose2 is not defined`

**When:** importing the package, before any of your code runs.
**Why:** <one or two sentences — the real cause, not the feeling>.
**Fix:**

```ts
// the line that prevents it
```
````

- The heading is the **exact** text a consumer sees (message, code, or HTTP
  status plus body) — what they will search for. Without the stack or the
  local path.
- Group under `##`-level areas (Install, Import, Configuration, Runtime)
  once there are more than six entries, and keep an index at the top.
- Sources: the errors the package throws (`grep -rn "throw new" src`), its
  error codes, the README Traps, and every consumer-facing trap in
  `AGENTS.md` — rewritten without private names.
- An entry that describes a bug being fixed links the roadmap line, and is
  removed when the fix ships.

### `roadmap.md` — what is next, never when

```md
# Roadmap

## Now
- **<item>** — <what it gives a consumer>. <issue link, if public>

## Next
## Later
## Not planned
- **<item>** — <why not>, so nobody opens the issue again.

## Shipped
- **<item>** — <version>.
```

- Items are phrased as what a consumer gets, not as internal tasks.
- **No dates, no private names, no customer.** A roadmap is a direction,
  not a commitment; the version it shipped in is the only number.
- Sources: open issues (`gh issue list`), `TODO`/`FIXME` in `src/`,
  pending changesets, and the effort currently in progress. Move an item
  to **Shipped** in the PR that ships it, with the version the changeset
  will produce; keep the last ten there, `CHANGELOG.md` holds the rest.
- **Not planned** is the most useful section: it records a question that
  was already settled, with its reason.

Patch changeset: the README and `docs/` ship.

## Agents

| Agent | Does |
| --- | --- |
| `documentation-writer` | writes the README and `docs/guide/` pages for the packages named |
| `troubleshooting-writer` | writes `docs/troubleshooting.md` from the package's errors and traps |
| `roadmap-keeper` | writes `docs/roadmap.md` from issues, TODOs, changesets and the branch in progress |
| `documentation-auditor` | read-only; reports gaps against this bar, `ok: true` only with no `bug` |

The writers edit only documentation: `README.md` and `docs/`, plus `docs`
in `files`. A code change they would need is reported, not made.

## How

1. Make the code change.
2. Delegate to the writer that owns what changed — `documentation-writer`
   for the surface, `troubleshooting-writer` for an error, `roadmap-keeper`
   for planned or shipped work. They can run in parallel: they write
   different files.
3. Delegate to the `documentation-auditor` agent for the packages you touched.
4. Apply every `bug` gap in this PR. Suggestions too, unless they would invent
   a catalogue of unused type aliases.
5. Patch changeset if the README or `docs/` ships (they do).

Do not finish a package change with an auditor report still listing `bug`.

A package with no `docs/` yet is not a reason to block an unrelated fix: the
auditor reports it once as a `suggestion`, and the writers create it when
asked.
