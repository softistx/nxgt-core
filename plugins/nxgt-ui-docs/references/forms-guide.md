# `docs/guides/forms.md` — the outline

Required for any component library that ships a field. Fields are what a
library's users wire most often and get wrong most quietly: a wrapper that
never shows its error, a value typed `string` that the field emits as
`number | null`, a translated schema message that falls back to English.

Every section below has a **runnable example**, imports included. The React
column is `@nxgt/material` (React Hook Form + Zod); the Vue column is
`@nxgt/material-vue` (vee-validate + Zod). Section headings are the same in
both so a link to `forms.md#the-pair` works in either library.

| Section (`##`) | Shows |
| --- | --- |
| **The pair** | `TextField` standalone (controlled `value` / `onChange`, or `v-model`) next to `TextFormField` inside a form. What the wrapper does for you: value, `onBlur`, `error`, `helperText` from the field state. |
| **A complete form** | The smallest real form: schema, resolver / `toTypedSchema`, default values, three fields of different kinds, a submit button with loading, `handleSubmit`. |
| **Validation messages** | Zod messages translated through the library's error map (`zodLocaleError()`), and a per-field override. What happens with no i18n provider. |
| **What each field emits** | A table: field → value type (`NumberField` → `number \| null`, `PhoneField` → E.164 string, `DateRangeField` → `{ from, to }`, uploads → URL or `File`…). Default values must match it. |
| **Composite values** | One dialog-backed or list value end to end (`ContactsFormField`, `AttributesFormField`, `PostalAddressFormField`): its value shape and a default. |
| **Config-driven forms** | `Field` / `FormField` rendering from a `{ type, name, label, … }` config array; when to reach for it and when not. |
| **Server errors** | Mapping an API's field errors onto the form (`setError` / `setErrors`) and a form-level error in an `Alert`. |
| **Dialogs and steps** | A form inside `ConfirmationDialog` / a dialog, and a multi-step form (`createStepFormSlice` in React, `defineStepFormStore` in Vue). |
| **Filters are forms too** | `FilterFormField` / the filter schema, pointing to its page rather than repeating it. |
| **Traps** | Each with the one line that avoids it: a wrapper outside its form provider, a default of the wrong type, a disabled field left out of the submitted values, a field re-mounted on every render losing its state. |

## Rules

- **Every field in the category pages links here** from its footer
  (`Form wrapper: TextFormField — see forms`). This page does not repeat
  each field's props; it shows the wiring once.
- The value-type table is **read from the source** (`onChange` / emitted
  type of each field), not from the story. A wrong row here is a bug a
  consumer ships.
- Examples use the library's own `Button`, `Alert`, dialogs — the reader
  should be able to paste the whole page into an app with only this library
  installed.
