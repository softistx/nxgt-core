# The twelve categories

Shared by `@nxgt/material` and `@nxgt/material-vue`, in this order, on every
surface: README `###` headings, `docs/components/<page>.md`, and the first
segment of each Storybook `title`.

| # | Storybook title / README heading | `docs/components/` page | What belongs here |
| --- | --- | --- | --- |
| 1 | `Primitives` | `primitives.md` | Building blocks with no opinion of their own: card surface, typography, label, input, textarea, input group, icon, kbd, separator, table, tabs, toggle, accordion, collapsible |
| 2 | `Buttons & actions` | `buttons-and-actions.md` | Anything you press that is not a field: buttons, link buttons, copy, load more, scroll to top, action card, theme and language switches |
| 3 | `Form fields` | `form-fields.md` | Labelled inputs with a value, each with its form-library wrapper, and the composite values (attributes, contacts, address, opening hours) |
| 4 | `Date & time` | `date-and-time.md` | Calendar, date, range, time, duration |
| 5 | `Selection & choice` | `selection-and-choice.md` | Picking among options: select, combobox, autocomplete, checkbox, radio, card and chip choices, transfer and sortable lists, switcher |
| 6 | `Data display` | `data-display.md` | Read-only presentation: avatar, badge, chip, stat and metric cards, card presets, list tile, timeline, code, markdown, terminal, API docs blocks, QR and barcode |
| 7 | `Data table, filter & lists` | `data-table-filter-and-lists.md` | Collections you query: data table, filter, pagination, tree, drag and drop |
| 8 | `Navigation & layout` | `navigation-and-layout.md` | Where a page sits and how you move: app shell, sidebar, app bars, breadcrumb, page layouts, grid, resizable, skip link, pager, TOC, steppers, hero, doc site shell |
| 9 | `Overlays & menus` | `overlays-and-menus.md` | Floating and modal surfaces: dialog, sheet, drawer, popover, hover card, tooltip, dropdown, context menu, menubar, command palette |
| 10 | `Feedback & status` | `feedback-and-status.md` | Telling the user what happened: alert, banner, confirm dialogs, empty state, progress, spinner, skeleton, toast, notifications |
| 11 | `Media & files` | `media-and-files.md` | Uploads, file lists, images and cropping, galleries, carousel, PDF, audio/video player, camera, maps, print documents |
| 12 | `Rich widgets` | `rich-widgets.md` | Self-contained applications-in-a-component: chat, kanban, event calendar, charts, emoji and mentions, rich-text and code editors, quiz |

Storybook MDX pages go under `Guides/` (`Guides/Introduction`,
`Guides/i18n/…`), sorted before the categories.

## Rules for placing a component

- **By what a consumer is looking for, not by how it is built.** An
  `ActionCard` is a card, but you *press* it: Buttons & actions. A
  `ConfirmDialog` is a dialog, but it exists to *confirm*: Feedback & status.
  Dialog primitives with no message of their own: Overlays & menus.
- **A field goes where its value lives.** `DateField` in Date & time,
  `SelectField` in Selection & choice, `S3UploadField` in Media & files.
  Form fields holds the text-like and composite values.
- **A family is one entry.** `Card`, `CardHeader`, `CardTitle`… is one row,
  one `##`, one preview.
- **Nested titles for a family of screens** in Storybook only:
  `Rich widgets/Chat/Inbox`, `Rich widgets/Charts/BarChart`. The page keeps
  one `##` per exported component.
- **Both libraries agree.** A component moved in one is moved in the other in
  the same round of `repo-sync`.

## Storybook sort order

```ts
// .storybook/preview.ts
parameters: {
	options: {
		storySort: {
			order: [
				'Guides', ['Introduction', '*'],
				'Primitives', 'Buttons & actions', 'Form fields', 'Date & time',
				'Selection & choice', 'Data display', 'Data table, filter & lists',
				'Navigation & layout', 'Overlays & menus', 'Feedback & status',
				'Media & files', 'Rich widgets',
			],
		},
	},
},
```

`storySort` is serialised, not executed: keep it a literal.

## Preview file names

Storybook derives the component id from the title by lowercasing and
replacing every run of non-alphanumerics with `-`:

| Title | Preview |
| --- | --- |
| `Form fields/TextField` | `docs/previews/form-fields-textfield.webp` |
| `Buttons & actions/Button` | `docs/previews/buttons-actions-button.webp` |
| `Rich widgets/Charts/BarChart` | `docs/previews/rich-widgets-charts-barchart.webp` |
| `Data table, filter & lists/DataTable` | `docs/previews/data-table-filter-lists-datatable.webp` |

The capture writes exactly this name; the pages link exactly this name.
