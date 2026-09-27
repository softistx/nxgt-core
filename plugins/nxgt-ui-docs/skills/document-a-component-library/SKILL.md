---
name: document-a-component-library
description: >-
  Documents a UI component library — @nxgt/material (React) and
  @nxgt/material-vue first — with a preview image per component, one
  twelve-category taxonomy shared by the README, docs/components/ and the
  Storybook sidebar, and the guides a component library owes its users
  (forms first). Use when adding, renaming, moving or removing a component or
  a story; when a preview is missing or stale; when writing or restructuring
  a component library's README or docs/; when setting up preview capture in a
  new UI repository; or when running /document-a-component-library.
---

# Skill: Document a component library

A component library is read by looking, not by reading. A consumer scanning
for "the thing that picks a date range" needs to *see* it, find it under the
same heading in the README, in `docs/` and in Storybook, and copy an example
that compiles. This skill is the bar for that. It sits on top of
`nxgt-docs:keep-docs-current` — the README shape, `troubleshooting.md` and
`roadmap.md` rules still apply — and adds what is specific to UI.

The sister libraries (`@nxgt/material` ↔ `@nxgt/material-vue`) follow it
identically: same categories, same page names, same preview file names. A
consumer switching framework finds everything in the same place.

## 1. One taxonomy, three surfaces

Twelve categories, in this order, everywhere. The list and what belongs in
each live in [`references/taxonomy.md`](../../references/taxonomy.md).

| Surface | Uses the category as |
| --- | --- |
| README `## Components` | a `###` heading with a catalogue table |
| `docs/components/<slug>.md` | one page per category, one `##` per component |
| Storybook | the first segment of every story `title` (`Form fields/TextField`) |

Plus one non-component group, `Guides/…`, for Storybook MDX pages (the
introduction, i18n).

- **Never** a catch-all (`UI/`, `Components/`, `Misc/`, `Blocks/`). A
  component that fits nowhere is a question for the taxonomy, answered in
  `taxonomy.md` in the same PR — not a thirteenth bucket.
- The Storybook sidebar is sorted by `parameters.options.storySort.order`
  in `.storybook/preview.ts`, which lists the twelve categories in order.
- Storybook's `storybook init` sample pages (`Configure your project`, its
  `src/stories/assets/`) are deleted. They describe Storybook, not the
  library, and they are the first thing a newcomer clicks.

## 2. A preview per component

Every catalogue entry has a picture: `docs/previews/<component-id>.webp`,
where `<component-id>` is **Storybook's own id for the title** — the story
id without `--<story>`, so `form-fields-textfield` for
`Form fields/TextField`. Nobody invents a file name; the sister library
produces the same one for the same title.

- **One story per title is tagged `preview`** (`tags: ['preview']`). It
  is the story that shows the component best: the variant gallery, not
  the lone default button; an overlay **open**, not its closed trigger;
  realistic data, not `Lorem`. Choose it by looking at the capture.
- Capture runs in **Vitest browser mode with Playwright**, through
  `@storybook/addon-vitest` and **`storybookProject` from
  `@nxgt/playwright/storybook`** (softistx/nxgt-devkit): the same stories
  are the smoke test (`test:stories`) and the preview source
  (`docs:previews`). Nothing is copied into the library; the wiring is in
  [`references/storybook-vitest.md`](../../references/storybook-vitest.md).
- The capture crops to what is painted, pads 24 px, caps the width at
  960 px and encodes WebP in the browser (canvas `toDataURL`) — no native
  image dependency, nothing to install on the machine but the browser.
- Previews are **committed** and **shipped**: `docs` is in `files`. Run
  `bun run docs:previews` after a visual change and commit what moved.
  A preview is regenerated, never edited by hand.

### Where the images are read from

| Page | Image URL | Why |
| --- | --- | --- |
| `docs/**/*.md` | relative: `../previews/<id>.webp` | renders on GitHub and in an editor opened on `node_modules` |
| `README.md` (the npm page) | `https://cdn.jsdelivr.net/npm/<package>@<major>/docs/previews/<id>.webp` | npm resolves relative images against the repository, and a private repository serves nothing to npmjs |

Pin the jsDelivr URL to the **major** (`@2`), not `@latest` and not an exact
version: it follows patches without breaking when a major renames things,
and it does not need editing on every release.

## 3. `docs/` layout

```
docs/
  README.md                ← index: "Page | Read it when"
  getting-started.md       ← install, peers, styles, icons, first component
  components/
    README.md              ← the gallery: one cover preview per category
    primitives.md          ← one page per category (slugs in taxonomy.md)
    …
  guides/
    forms.md               ← REQUIRED for any library that ships fields
    i18n.md
    theming.md
    ssr.md
    <area>.md              ← one per area a consumer starts from
  previews/<component-id>.webp
  troubleshooting.md       ← nxgt-docs:troubleshooting-writer
  roadmap.md               ← nxgt-docs:roadmap-keeper
```

### A category page

The template is
[`references/component-page.md`](../../references/component-page.md). Per
component, in this order: the preview, one sentence, the import, the
smallest example that compiles, the options that change behaviour, the
Storybook title, the sister-library equivalent. A composite family
(`Card*`, `Select*`) is **one** entry listing its parts, not one per part.

### The forms guide is not optional

Fields are what a library's users wire most, and wire wrong. Every library
with a field component has `docs/guides/forms.md` covering, each with an
example: the field / form-field pair, the form library integration
(React Hook Form in React, vee-validate in Vue), schema validation and
translated messages, a composite field (a list or a dialog-backed value),
the config-driven `Field`, and a submit with server errors. The outline is
in [`references/forms-guide.md`](../../references/forms-guide.md).

## 4. The README

The `nxgt-docs` README shape applies, with these UI specifics:

- `## Components` keeps the grouped catalogue — the one place a stranger
  sees everything at once — with a **Preview** column holding a thumbnail
  (`<img src="…jsdelivr…" width="120" alt="TextField">`) and each name
  linking to its `docs/components/<slug>.md#<anchor>`.
- Long sections move to `docs/guides/` and leave a two-line summary with a
  link: printing, maps, SSR, helpers, upgrade notes. The README is the
  entry, not the manual.
- A `## Documentation` section at the end links `docs/README.md`, the
  component gallery, the forms guide, troubleshooting and the roadmap.

## When a component changes

| Change | Same PR |
| --- | --- |
| new component | story titled in its category, one story tagged `preview`, `bun run docs:previews`, README row, category page entry |
| visual change | `bun run docs:previews`, commit the changed `.webp` |
| rename or move | story `title`, the old `.webp` deleted, README row and page anchor |
| removal | story, `.webp`, README row, page entry |
| new field | also `docs/guides/forms.md` if it wires differently from its siblings |

Then the sister library, through `repo-sync`: same category, same title,
same page.

## Agents

| Agent | Does |
| --- | --- |
| `component-docs-writer` | writes `docs/components/<category>.md` pages and the gallery for the categories named |
| `ui-docs-auditor` | read-only; checks taxonomy, preview tags, preview files, README rows and page entries against the barrel; `ok: true` only with no `bug` |

Guides, troubleshooting and roadmap are written by the `nxgt-docs` agents;
this plugin depends on it.
