# @nxgt/i18n-vue

i18n for a Vue or Nuxt app, on [`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n)'s
conventions: nested catalogues of
[ICU](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
messages, one per locale, and `t(key, args)`. What it adds:

- **The catalogues are checked.** A key missing in one locale, a key the
  fallback locale does not have, an argument a translation adds or uses as
  another kind, a message that is not valid ICU: each **throws**, naming the
  locale and the key — at build time with the Vite plugin or the Nuxt module,
  and again when the app starts.
- **`t` is typed.** A generated declaration file makes `t('home.title')`
  completed and checked in `.vue` templates and in TypeScript: an unknown key,
  a missing argument, or an argument of the wrong kind is a type error.
- **The locale is reactive**, and chosen for you: a stored preference, then
  the visitor's languages, then the fallback locale. Under Nuxt it is chosen
  **on the server** (cookie, then `Accept-Language`), so the page hydrates in
  the language it was rendered in.

```ts
import { createApp } from 'vue';
import { createI18n, detectLocale } from '@nxgt/i18n-vue';
import en from './locales/en.json';
import fr from './locales/fr.json';

const i18n = createI18n({ catalogues: { en, fr }, locale: detectLocale(['en', 'fr'], 'en') });
createApp(App).use(i18n).mount('#app');
```

```vue
<template>
	<h1>{{ t('home.title') }}</h1>
	<p>{{ t('home.greeting', { name: user.name }) }}</p>
</template>
```

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/i18n-vue vue
```

Peers:

- `vue` (`^3.5`), required.
- `typescript` (6), required — `^6.0.3`, as every `@nxgt/*` package. Bundler
  resolution (`"moduleResolution": "bundler"`) is what is supported and tested.
- `vite` (`>=5`), optional — for `@nxgt/i18n-vue/vite`.
- `nuxt` and `@nuxt/kit` (`^4`), optional — for `@nxgt/i18n-vue/nuxt`. The
  main entry never imports them.

## Subpaths

| Import | What it is | Runs in |
| --- | --- | --- |
| `@nxgt/i18n-vue` | `createI18n`, `useI18n`, and everything of `/core` | browser, server |
| `@nxgt/i18n-vue/core` | Catalogue checks, `createTranslator`, `pickLocale`, `parseAcceptLanguage`, `detectLocale`, the types — no `vue` import | anywhere |
| `@nxgt/i18n-vue/vite` | `i18nTypes()`, the Vite plugin that checks the catalogues and writes the types; the loaders and the generator it is made of | Node, at build |
| `@nxgt/i18n-vue/nuxt` | The Nuxt module | Node, at build |
| `@nxgt/i18n-vue/nuxt/runtime` | `setupNuxtI18n`, what the module's plugin runs | browser, server |

## Catalogues

One JSON file per locale, nested, kebab-case keys — the convention
`@nxgt/i18n` uses. camelCase is still accepted, for a catalogue written
before this; the two are equivalent, on either side: a key `sign-in` is also
found by `t('auth.signIn')`, and the generated types complete and check both
spellings. The fallback locale (the first, by default) is the reference:
every other locale has exactly its keys, and may leave an argument out but
never add one.

```json
// locales/en.json — locales/fr.json has the same keys
{
	"home": {
		"title": "Welcome",
		"greeting": "Hello {name}",
		"items": "{count, plural, one {# item} other {# items}}",
		"sent-on": "Sent on {at, date, short}"
	}
}
```

An argument's kind comes from how the message uses it: `{n, number}` and
`{n, plural, …}` take a number, `{at, date}` and `{at, time}` a `Date` or a
timestamp, anything else a string or a number. See
[Catalogues](docs/guide/catalogues.md).

## Vue

```ts
// main.ts
const i18n = createI18n({
	catalogues: { en, fr },
	fallbackLocale: 'en', // default: the first locale
	locale: detectLocale(['en', 'fr'], 'en'), // default: fallbackLocale
});
createApp(App).use(i18n);
```

`app.use(i18n)` adds `t` to every template and provides the i18n to
`useI18n()`:

```vue
<script setup lang="ts">
import { type Locale, useI18n } from '@nxgt/i18n-vue';
import { computed } from 'vue';

const { t, locale, locales, setLocale } = useI18n();
const title = computed(() => t('home.title'));
const choose = (event: Event) =>
	setLocale((event.target as HTMLSelectElement).value as Locale);
</script>

<template>
	<h1>{{ title }}</h1>
	<select :value="locale" @change="choose">
		<option v-for="l in locales" :key="l" :value="l">{{ l }}</option>
	</select>
	<p>{{ t('home.items', { count: 3 }) }}</p>
</template>
```

| Member | What it is |
| --- | --- |
| `t(key, args?)` | The message in the current locale. Reactive: a template or a `computed` re-runs when the locale changes |
| `locale` | The current locale, a read-only `Ref` |
| `setLocale(locale)` | Switches every `t` of the app. A locale the catalogues do not have **throws** |
| `locales`, `fallbackLocale` | The catalogues' locales, and the reference one |
| `has(key)` | Whether a key computed at run time is a message — `t` would throw otherwise |

To remember a choice in a browser app, store it where `detectLocale` reads it:

```ts
watch(i18n.locale, (locale) => localStorage.setItem('language', locale));
```

See [Vue](docs/guide/vue.md).

## Choosing the locale

```ts
import { detectLocale, parseAcceptLanguage, pickLocale } from '@nxgt/i18n-vue';

pickLocale(['de', 'fr-CA'], ['en', 'fr'], 'en'); // 'fr'
parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8'); // ['fr-CA', 'fr', 'en']
detectLocale(['en', 'fr'], 'en'); // localStorage.language, then navigator.languages, then 'en'
```

`pickLocale` takes the wanted locales most wanted first: an exact match wins
(case and `_`/`-` do not matter), then a match on the language alone (`fr-CA`
picks `fr`, and `pt` picks `pt-BR`), then the fallback. See
[Choosing the locale](docs/guide/locale.md).

## Types for `t` — Vite

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { i18nTypes } from '@nxgt/i18n-vue/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [vue(), i18nTypes({ locales: ['en', 'fr'] })],
});
```

At every `vite dev` and `vite build` — and in `vite dev` each time a
catalogue changes — it reads `locales/<locale>.json`, checks the catalogues,
and writes `src/generated/i18n.d.ts`. A catalogue that cannot be right
**fails the build**. Git-ignore the file, and keep it in your `tsconfig.json`'s
`include` (`src/**` covers it). Then:

```vue
<template>
	<!-- a type error: 'home.titel' is not a key -->
	{{ t('home.titel') }}
	<!-- a type error: home.greeting needs { name } -->
	{{ t('home.greeting') }}
</template>
```

| Option | Default | Effect |
| --- | --- | --- |
| `locales` | — (required) | Every locale, as BCP 47 tags |
| `fallbackLocale` | the first locale | The reference catalogue, and the one the types are written from |
| `dir` | `'locales'` | The folder of `<locale>.json`, from Vite's `root` |
| `catalogues` | `[]` | Catalogues a package ships, merged **under** yours key by key — pass the same to `layerCatalogues` at run time |
| `out` | `'src/generated/i18n.d.ts'` | The file written. A file there that the plugin did not write is never replaced: that throws |

See [Types](docs/guide/types.md).

## Nuxt

```ts
// nuxt.config.ts
export default defineNuxtConfig({
	modules: ['@nxgt/i18n-vue/nuxt'],
	nxgtI18n: { locales: ['en', 'fr'] },
});
```

```vue
<!-- app/pages/index.vue — t in the template, useI18n auto-imported -->
<script setup lang="ts">
const { locale, setLocale } = useI18n();
</script>

<template>
	<h1>{{ t('home.title') }}</h1>
	<button type="button" @click="setLocale(locale === 'en' ? 'fr' : 'en')">{{ locale }}</button>
</template>
```

The module reads `locales/<locale>.json` at the project's root when Nuxt
starts (`nuxt dev`, `build`, `prepare`) and checks them, adds a plugin that
installs the i18n, writes `.nuxt/types/nxgt-i18n-vue.d.ts` so `t` is typed,
and auto-imports `useI18n`. On each request the locale is:

1. the `language` cookie, when it is a locale of the catalogues;
2. else the best match for `Accept-Language`;
3. else the fallback locale.

It travels in the payload, so the browser hydrates in the same locale, and it
sets `<html lang>`. `setLocale` writes the cookie, so the next page is
rendered in the new locale; a locale only guessed from `Accept-Language`
never sets one. Options: `locales`, `fallbackLocale`, `dir` and `catalogues`
as for Vite, and `cookie` (default `'language'`). A change to a catalogue
restarts `nuxt dev`. See [Nuxt](docs/guide/nuxt.md).

## Outside Vue

`createTranslator` is `@nxgt/i18n`'s translator, strict, and imports no
`vue`:

```ts
import { createTranslator } from '@nxgt/i18n-vue/core';

const t = createTranslator({ en, fr }, () => user.locale);
t('home.greeting', { name: 'Ada' });
t('home.greeting', { name: 'Ada' }, 'fr'); // a language per call
```

It throws where `@nxgt/i18n`'s answers the key. It does not check the
catalogues — `checkCatalogues` does, and `createI18n` calls it. Without
generated types, `createTranslator<CatalogueKey<typeof en>>(…)` types its keys
from the catalogue itself. See [Outside Vue](docs/guide/translator.md).

## Exports

| Export | What it is |
| --- | --- |
| `createI18n(options)`, `I18n`, `I18nOptions` | The i18n of an app: a Vue plugin with a reactive locale |
| `useI18n()` | The installed i18n, in a component or where `inject` works |
| `createTranslator(catalogues, getLanguage)`, `Translate`, `LanguageProvider` | `t(key, args?, language?)` without Vue |
| `pickLocale`, `parseAcceptLanguage`, `detectLocale`, `WantedLocales`, `DetectLocaleOptions` | Choosing the locale |
| `checkCatalogues`, `layerCatalogues`, `checkArguments` | The checks `createI18n` runs, and the merge of a package's catalogues under yours |
| `createFormatter`, `Formatter`, `lookup` | The ICU formatting `t` uses, with its cache; a message by dotted key, or `null` |
| `Catalogue`, `Catalogues`, `ArgumentKind`, `Message`, `Messages`, `MessageArgs` | A catalogue as written, catalogues by locale, and a checked message |
| `I18nMessages`, `I18nLocales`, `MessageKey`, `Locale`, `MessageArgsOf`, `KeyOf`, `ArgsOf`, `CatalogueKey` | The types the generated file fills, and the ones built on them |
| `/vite`: `i18nTypes`, `I18nTypesOptions`, `TYPES_FILE`, `loadCatalogues`, `readCatalogues`, `checkCatalogueSource`, `CatalogueSource`, `LoadedCatalogues`, `typesSource`, `TypesSourceOptions`, `writeTypes`, `writeIfChanged` | The Vite plugin, and the pieces for another build |
| `/nuxt`: default, `ModuleOptions`, `checkModuleOptions`, `pluginSource`, `PluginSourceOptions`, `STATE_KEY`, `TYPES_TEMPLATE`, `PLUGIN_TEMPLATE` | The Nuxt module |
| `/nuxt/runtime`: `setupNuxtI18n`, `NuxtI18nContext`, `STATE_KEY` | What the module's plugin runs |

## Things that bite

- **`t` throws; it never answers the key.** An unknown key, an argument left
  out, one the message does not use, or one of the wrong kind is an error in
  your code, and the type checker reports it first. For a key computed at run
  time, ask `has(key)` before `t`.
- **Every key is kebab-case or camelCase**, nested rather than dotted:
  `{ "home": { "sent-on": … } }` or `{ "home": { "sentOn": … } }`, never
  `"sent_on"` or `"home.sentOn"` as one key. The two conventions are
  equivalent on a key's segments only — an ICU argument name (`{firstName}`)
  is still camelCase-only.
- **A message is text.** Tags are not parsed (`<b>{name}</b>` formats to those
  characters), and Vue's `{{ }}` escapes the result. Never pass a message with
  arguments to `v-html`.
- **Create one i18n per request on a server.** The locale is the i18n's own;
  one shared across requests would switch every visitor. The Nuxt module does
  this for you. The catalogues are checked once per set of catalogue objects —
  `{ en, fr }` wrapped anew is the same set — so treat them as immutable.
- **Any component with its own `t`** (a prop, a `setup` binding) hides the
  global one in its template — which is how `const { t } = useI18n()` works.
- **What the types refuse is measured**: 20 cases in TypeScript, 7 in a
  template and 3 under Nuxt, each failing the typecheck the day it stops
  being refused. See [Types](docs/guide/types.md#type-safety-is-measured).

## Documentation

[docs/](docs/README.md) — a guide per area, [troubleshooting](docs/troubleshooting.md)
with every message this package throws, and the [roadmap](docs/roadmap.md).

## License

MIT
