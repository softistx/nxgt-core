# Roadmap

What `@nxgt/i18n-vue` does now, what may come, and what it will not do.

## Now

The first release: checked ICU catalogues, `createI18n` with a reactive
locale and `t` in every template, `useI18n`, `createTranslator` without Vue,
`pickLocale`, `parseAcceptLanguage` and `detectLocale`, the Vite plugin that
writes the types of `t`, and the Nuxt module that resolves the locale on the
server and hydrates from the payload.

## Next

- **Loading a locale's catalogue on demand**, so an app with many locales
  ships only the one it renders in. Today every catalogue is in the bundle.
- **Hot reload of a message in `nuxt dev`**, rather than a restart of Nuxt.

## Later

- **Checking templates under TypeScript 7.** Templates are unchecked under
  TypeScript 7 until `vue-tsc` supports it; check them where `typescript`
  resolves to 6 meanwhile.
- **Formats shared by every message** — named number, date and time formats
  declared once, as `intl-messageformat` allows.
- **Watching what a `messages` module imports**, not only its own file — so
  editing a JSON file it reads triggers `vite dev`'s regeneration the way a
  `dir` catalogue's file already does.

## Not planned

- **Locale prefixes in URLs, alternate links, localised routes.** Routing is
  the app's. Read the prefix in a middleware and call `setLocale`.
- **Answering the key when a message is missing.** `t` throws; the
  catalogues and the types make a missing key a build failure first.
- **HTML in messages.** A message is text, escaped like any other. Markup
  belongs in the template.
- **A dependency on `vue-i18n`.** This package keeps `@nxgt/i18n`'s
  catalogue shape and translator instead.

## Shipped

- **TypeScript 7 as well as 6** — the `typescript` peer accepts either. Under
  7, `tsc` checks the `.ts` files and the `.vue` templates go unchecked until
  `vue-tsc` runs on 7; see the troubleshooting page.
- **Catalogue keys in kebab-case, `@nxgt/i18n`'s own convention** — a key is
  written `sign-in` or `signIn`, either one, and `t()` finds the message
  whichever spelling the call uses. `@nxgt/i18n`'s own catalogues, kebab-case
  from the start, can now be checked and layered here as they are.
- **Splitting a catalogue across files, or generating it in code** —
  `locales/<locale>/**/*.json`, a file's path a key prefix, alongside the
  flat `locales/<locale>.json`; or a `messages` module the resources object
  comes from instead, shared by the app and the type generator. The shared
  loader is `@nxgt/i18n-vue/node`, for a build that is neither Vite nor Nuxt.
