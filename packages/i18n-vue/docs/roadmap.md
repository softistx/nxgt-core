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

- **Formats shared by every message** — named number, date and time formats
  declared once, as `intl-messageformat` allows.
- **An option to accept the kebab-case keys `@nxgt/i18n` ships**, so its
  catalogues can be layered under an app's.

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

Nothing yet: see [Now](#now).
