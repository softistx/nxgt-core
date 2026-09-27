# A category page — `docs/components/<page>.md`

One page per category (names in [`taxonomy.md`](taxonomy.md)). It opens with
a table of contents a reader can scan, then one `##` per component in the
order of the README table.

````md
# Form fields

Labelled inputs with a value. Each one comes as a standalone field
(`TextField`) and a form wrapper (`TextFormField`) — see the
[forms guide](../guides/forms.md) for wiring them into a form.

| | Component | What it does |
| --- | --- | --- |
| <img src="../previews/form-fields-textfield.webp" width="96" alt=""> | [TextField](#textfield) | Labelled input with adornments and helper text |
| … | | |

## TextField

![TextField](../previews/form-fields-textfield.webp)

Labelled input with leading / trailing adornments and helper text.

```tsx
import { TextField } from '@nxgt/material/components';

<TextField label="Name" placeholder="Ada Lovelace" helperText="As on your ID" />
```

| Prop | Type | Default | Effect |
| --- | --- | --- | --- |
| `label` | `ReactNode` | — | shown above, with `*` when `required` |
| `error` | `boolean` | `false` | red outline; `helperText` becomes the error |

**Form wrapper:** `TextFormField` — `control` and `name`, see
[forms](../guides/forms.md#the-pair).
**Storybook:** `Form fields/TextField` · **Vue:** `TextField`, `TextFormField`

---
````

## Rules

- **The preview first.** Alt text is the component name. Relative path —
  this page is read on GitHub and in `node_modules`, never on npmjs.
- **One sentence**, the same as the README row. Do not start two sources of
  truth; if the sentence changes, it changes in both.
- **The example compiles** against the current barrel, imports included.
  Read the component's props and its `preview` story before writing it;
  the story is usually the best example there is, minus Storybook's `args`.
- **Props table: only what changes behaviour** — at most eight rows. Types
  as a consumer writes them. Defaults read from the source, not guessed.
  Omit the table for a component whose props are its HTML element's.
- **Parts** of a family listed in one line under the example (`Card`,
  `CardHeader`, `CardTitle`, …), with the composed example showing them.
- **Footer line**: the form wrapper if any, the Storybook title (so a reader
  can open the live story), the sister-library equivalent or `—`.
- **No private application names**, no internal history. Why a default is
  what it is belongs in a sentence only when it will surprise a consumer
  (a map that asks for geolocation when `center` is omitted).
- `---` between components; a reader scrolling a long page needs the break.

## The gallery — `docs/components/README.md`

One section per category, in order: the category name linking to its page,
one sentence, and a row of up to four cover previews (the category's most
recognisable components), each linking to its anchor. This is the page the
README's `## Documentation` sends a newcomer to first.

```md
## [Form fields](form-fields.md)

Labelled inputs with a value, each with its form wrapper.

[<img src="../previews/form-fields-textfield.webp" height="72" alt="TextField">](form-fields.md#textfield)
[<img src="../previews/form-fields-phonefield.webp" height="72" alt="PhoneField">](form-fields.md#phonefield)
```
