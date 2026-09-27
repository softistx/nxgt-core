# Nuxt

How the Nuxt module installs the i18n, resolves the locale on the server, and
types `t`.

```sh
bun add @nxgt/i18n-vue
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

1. reads `locales/<locale>.json` and `locales/<locale>/**/*.json` from the
   project's root — or the resources object a `messages` module exports —
   merges any `catalogues` under them, and **checks** them. A catalogue that
   cannot be right fails the command, naming the locale and the key.
2. adds a plugin that installs the i18n in every request and in the browser.
3. writes `.nuxt/types/nxgt-i18n-vue.d.ts`, which types `t` in every
   template and `useI18n()` in every component ([Types](types.md)).
4. auto-imports `useI18n`.

In `nuxt dev`, a change to a file the module read restarts Nuxt, which reads
and checks the catalogues again — every `<locale>.json` and, with `dir`,
every `<locale>/**/*.json` too, whether it changed or is new.

## Options

Under `nxgtI18n`:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `locales` | `readonly string[]` | — (required) | Every locale, as BCP 47 tags |
| `fallbackLocale` | `string` | the first locale | The reference catalogue, and the answer when nothing matches |
| `dir` | `string` | `'locales'` | The folder of `<locale>.json`, from the project's root (`rootDir`, not `app/`) — and of `<locale>/**/*.json`, a folder file's path a key prefix. Not with `messages` |
| `messages` | `string` | — | A module whose default export is the resources object, or a function that returns it — instead of `dir`. Not with `dir` |
| `catalogues` | `readonly Catalogues[]` | `[]` | Catalogues a package ships, merged under yours key by key |
| `cookie` | `string` | `'language'` | The cookie that stores a chosen locale |

See [Splitting catalogues](catalogues.md#splitting-catalogues) for the folder
layout and `messages`.

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

## Writing the plugin yourself

The module's plugin is generated (`pluginSource`); it only passes Nuxt's
composables to `setupNuxtI18n`, from `@nxgt/i18n-vue/nuxt/runtime`. To change
what it does — another cookie option, another source of the requested
locale — write the same plugin without the module:

```ts
// app/plugins/i18n.ts
import { STATE_KEY, setupNuxtI18n } from '@nxgt/i18n-vue/nuxt/runtime';
import en from '~~/locales/en.json';
import fr from '~~/locales/fr.json';

export default defineNuxtPlugin({
	name: 'i18n',
	enforce: 'pre',
	setup(nuxtApp) {
		const i18n = setupNuxtI18n({
			catalogues: { en, fr },
			fallbackLocale: 'en',
			cookie: useCookie('language', { path: '/', sameSite: 'lax', maxAge: 31536000 }),
			state: useState<string | undefined>(STATE_KEY),
			requested: () =>
				import.meta.server
					? useRequestHeaders(['accept-language'])['accept-language']
					: navigator.languages,
		});
		nuxtApp.vueApp.use(i18n);
		useHead({ htmlAttrs: { lang: i18n.locale } });
	},
});
```

`setupNuxtI18n` resolves the locale (the state, then the cookie, then
`requested`, then the fallback), creates the i18n, and writes the state and
the cookie on each `setLocale`. Without the module, the types of `t` come from
`i18nTypes()` or a script ([Types](types.md#another-build)). Import from
`/nuxt/runtime` in a plugin, never from `/nuxt`: that one is the module, and
it imports `@nuxt/kit`.

## What it does not do

- **No locale in the URL.** There is no `/fr/…` routing, no alternate links,
  no SEO helpers. Read a prefix in your own middleware and call `setLocale`.
- **No lazy loading.** Every catalogue is in the plugin, so in the client
  bundle. Fine for tens of kilobytes; see the [roadmap](../roadmap.md).
- **No hot reload of a message.** A catalogue change restarts `nuxt dev`.
