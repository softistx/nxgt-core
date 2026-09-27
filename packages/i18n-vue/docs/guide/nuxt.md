# Nuxt

```sh
bun add @nxgt/i18n-vue @nxgt/i18n
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
	modules: ['@nxgt/i18n-vue/nuxt'],
	nxgtI18n: {
		locales: ['en', 'fr'],
	},
});
```

```text
locales/          ← at the project's root, next to nuxt.config.ts
  en.json
  fr.json
app/
  pages/index.vue
```

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
const { locale, locales, setLocale } = useI18n(); // auto-imported
</script>

<template>
	<h1>{{ t('home.title') }}</h1>
	<button v-for="l in locales" :key="l" type="button" :disabled="l === locale" @click="setLocale(l)">
		{{ l }}
	</button>
</template>
```

Nuxt 4 is what is tested. `nuxt` and `@nuxt/kit` are optional peers of this
package: install Nuxt as you normally would.

## What the module does

When Nuxt starts — `nuxt dev`, `nuxt build`, `nuxt prepare`:

1. reads `locales/<locale>.json` from the project's root, merges any
   `catalogues` under them, and **checks** them. A catalogue that cannot be
   right fails the command, naming the locale and the key.
2. adds a plugin that installs the i18n in every request and in the browser.
3. writes `.nuxt/types/nxgt-i18n-vue.d.ts`, which types `t` in every
   template and `useI18n()` in every component ([Types](types.md)).
4. auto-imports `useI18n`.

In `nuxt dev`, a change to a `<locale>.json` restarts Nuxt, which reads and
checks the catalogues again.

## Options

Under `nxgtI18n`:

| Option | Default | Effect |
| --- | --- | --- |
| `locales` | — (required) | Every locale, as BCP 47 tags |
| `fallbackLocale` | the first locale | The reference catalogue, and the answer when nothing matches |
| `dir` | `'locales'` | The folder of `<locale>.json`, from the project's root (`rootDir`, not `app/`) |
| `catalogues` | `[]` | Catalogues a package ships, merged under yours key by key |
| `cookie` | `'language'` | The cookie that stores a chosen locale |

A wrong option is a `TypeError` starting `nxgtI18n:` when Nuxt starts.

## How the locale is resolved

On each request, on the server:

1. the cookie (`language`), when it holds a locale of the catalogues;
2. else the best match for the `Accept-Language` header, as by
   [`pickLocale`](locale.md);
3. else `fallbackLocale`.

The page is rendered in it, `<html lang>` is set to it, and it is written to
Nuxt's payload (`useState('@nxgt/i18n-vue:locale')`). In the browser, the
plugin reads the payload rather than resolving again, so the app hydrates in
the locale the server rendered in — `navigator.languages` and the browser's
own view of the cookie play no part, and there is no hydration mismatch.

With `ssr: false`, there is no payload: the browser resolves from the cookie,
then `navigator.languages`, then the fallback locale.

## Switching, and the cookie

```ts
const { setLocale } = useI18n();
setLocale('fr');
```

`setLocale` switches the page at once, and writes the locale to the payload
state and to the cookie (`path=/`, `SameSite=Lax`, a year), so the next page
the server renders is in the new locale. A locale guessed from
`Accept-Language` is **never** written: only a choice is remembered. The
cookie is readable by the page's scripts, as Nuxt's `useCookie` makes it.

Call `setLocale` from a route middleware or a server-side plugin to set a
locale from the URL; on the server, the cookie is sent with the response.

## Types

`.nuxt/types/nxgt-i18n-vue.d.ts` is included by the `tsconfig` Nuxt
generates, so `vue-tsc` checks `t('…')` in every template once `nuxt prepare`
has run:

```sh
nuxt prepare && vue-tsc -b
```

## What it does not do

- **No locale in the URL.** There is no `/fr/…` routing, no alternate links,
  no SEO helpers. Read a prefix in your own middleware and call `setLocale`.
- **No lazy loading.** Every catalogue is in the plugin, so in the client
  bundle. Fine for tens of kilobytes; see the [roadmap](../roadmap.md).
- **No hot reload of a message.** A catalogue change restarts `nuxt dev`.
