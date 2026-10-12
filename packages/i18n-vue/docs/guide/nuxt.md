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
2. adds a plugin that installs the i18n in every request and in the browser
   — with `lazy: true`, one that loads every locale but the fallback one on
   demand ([What `lazy` generates](#what-lazy-generates)).
3. writes `.nuxt/types/nxgt-i18n-vue.d.ts`, which types `t` in every
   template and `useI18n()` in every component ([Types](types.md)).
4. auto-imports `useI18n`.

In `nuxt dev`, a change to a file the module read restarts Nuxt, which reads
and checks the catalogues again — every `<locale>.json` and, with `dir`,
every `<locale>/**/*.json` too, whether it changed or is new — and writes
every template again, the locale modules of `lazy` included.

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
| `lazy` | `boolean` | `false` | Load every locale but the fallback one on demand, each a chunk of its own ([below](#what-lazy-generates)) |

See [Splitting catalogues](catalogues.md#splitting-catalogues) for the folder
layout and `messages`.

A wrong option is a `TypeError` starting `nxgtI18n:` when Nuxt starts.

## What `lazy` generates

```ts
// nuxt.config.ts
export default defineNuxtConfig({
	modules: ['@nxgt/i18n-vue/nuxt'],
	nxgtI18n: {
		locales: ['en', 'fr', 'de'],
		lazy: true,
	},
});
```

Without `lazy`, the plugin inlines every catalogue, so the client bundle
holds them all. With `lazy: true`, the module writes, under `.nuxt/`:

- **one module per locale but the fallback one**,
  `nxgt-i18n-vue/locales/<locale>.mjs`, whose default export is that
  locale's merged catalogue — folder layout and packages' `catalogues`
  included, checked like the others when Nuxt starts:

  ```js
  // .nuxt/nxgt-i18n-vue/locales/fr.mjs
  export default {"home":{"title":"Bienvenue"}};
  ```

- **the plugin**, which inlines the fallback catalogue alone and imports
  each other locale on demand — the plugin of
  [Locales loaded on demand](#locales-loaded-on-demand), written for you:

  ```js
  // .nuxt/nxgt-i18n-vue/plugin.mjs, abridged
  const catalogues = {"en":{"home":{"title":"Welcome"}}};
  const loaders = {
  	"fr": () => import("#build/nxgt-i18n-vue/locales/fr.mjs"),
  	"de": () => import("#build/nxgt-i18n-vue/locales/de.mjs"),
  };
  const locales = ["en","fr","de"];

  export default defineNuxtPlugin({
  	name: '@nxgt/i18n-vue',
  	enforce: 'pre',
  	async setup(nuxtApp) {
  		// useRequestHeaders, useCookie and useState, all before the await
  		const i18n = await setupLazyNuxtI18n({ catalogues, loaders, locales, /* … */ });
  		nuxtApp.vueApp.use(i18n);
  		nuxtApp.runWithContext(() => useHead({ htmlAttrs: { lang: i18n.locale } }));
  	},
  });
  ```

What follows from it:

- **`nuxt build` emits a chunk per locale** but the fallback one, and the
  entry chunk holds none of them. The browser fetches one only when the
  page switches to it: Nuxt writes a `<link rel="prefetch">` for every
  dynamic import, which would make every page download every locale once
  the browser is idle, so the module turns the prefetch and the preload of
  the locale chunks off (in its `build:manifest` hook). Every other chunk is
  prefetched as before.
- **The server renders in the visitor's locale**, never in the fallback one
  first. The plugin is async and not `parallel`, so Nuxt waits for it —
  and for the visitor's catalogue — before the next plugin and before
  rendering.
- **The catalogue the page was rendered in travels in the payload**
  (`CATALOGUE_STATE_KEY`; `null` for the fallback locale), so the browser
  hydrates in it without fetching its chunk. The page's HTML grows by that
  one catalogue.
- **`setLocale` answers a promise**, resolved once the locale's chunk is
  loaded. A click handler can ignore it; on the server, `await` it — in a
  route middleware, say — or the page renders in the previous locale:

  ```ts
  // app/middleware/locale.global.ts
  export default defineNuxtRouteMiddleware(async (to) => {
  	const { locales, setLocale } = useI18n();
  	const wanted = locales.find((locale) => locale === to.query.lang);
  	if (wanted !== undefined) await setLocale(wanted);
  });
  ```

- **The types under `.nuxt/` are the same**: `t` and `setLocale` are typed
  from the fallback catalogue and `locales`, whether a locale is inline or
  loaded on demand.
- **The locale is resolved among `locales` in the order you configured**,
  as without `lazy`: with `['pt-PT', 'pt-BR', 'en']`, `Accept-Language: pt`
  picks `pt-PT` either way. `useI18n().locales`, though, lists the fallback
  locale first, then the others in your order — `createI18n`'s order, the
  locales of `catalogues` then those of `loaders`
  ([The rules](vue.md#the-rules)). Sort it yourself for a language menu.
- **Everything else is the same**: the locale is resolved, stored and
  hydrated as [below](#how-the-locale-is-resolved); a catalogue change in
  `nuxt dev` restarts Nuxt, which writes the locale modules again.

`lazy` only produces the `loaders` record `createI18n` takes
([Loading a locale on demand](vue.md#loading-a-locale-on-demand)); the plugin
is the one you could write by hand. With one locale only, there is nothing to
load on demand and the plugin has no loader. `lazy` must be a boolean
([Troubleshooting](../troubleshooting.md#nxgti18n-lazy-must-be-true-or-false-as--locales-en-fr-lazy-true-)).

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

The module's plugin is generated (`pluginSource`; with its `loaders`
option, the plugin of `lazy`); it only passes Nuxt's composables to
`setupNuxtI18n`, from `@nxgt/i18n-vue/nuxt/runtime`. To change
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

### Locales loaded on demand

`setupLazyNuxtI18n` is the same plugin with some locales in `loaders` — what
the module's [`lazy`](#what-lazy-generates) generates
([Loading a locale on demand](vue.md#loading-a-locale-on-demand)): only the
fallback locale ships in the plugin, and each other one is a chunk of its
own. It is async, so the plugin is too:

```ts
// app/plugins/i18n.ts
import type { Catalogue } from '@nxgt/i18n-vue';
import {
	CATALOGUE_STATE_KEY,
	STATE_KEY,
	setupLazyNuxtI18n,
} from '@nxgt/i18n-vue/nuxt/runtime';
import en from '~~/locales/en.json';

export default defineNuxtPlugin({
	name: 'i18n',
	enforce: 'pre',
	async setup(nuxtApp) {
		// Every composable before the first await: Nuxt's context is gone after it.
		const header = import.meta.server
			? useRequestHeaders(['accept-language'])['accept-language']
			: undefined;
		const i18n = await setupLazyNuxtI18n({
			catalogues: { en },
			loaders: {
				fr: () => import('~~/locales/fr.json'),
				de: () => import('~~/locales/de.json'),
			},
			locales: ['en', 'fr', 'de'],
			fallbackLocale: 'en',
			cookie: useCookie('language', { path: '/', sameSite: 'lax', maxAge: 31536000 }),
			state: useState<string | undefined>(STATE_KEY),
			catalogue: useState<Catalogue | null | undefined>(CATALOGUE_STATE_KEY),
			requested: () => (import.meta.server ? header : navigator.languages),
		});
		nuxtApp.vueApp.use(i18n);
		// After the await: a composable needs the context back.
		nuxtApp.runWithContext(() => useHead({ htmlAttrs: { lang: i18n.locale } }));
	},
});
```

What it adds to `setupNuxtI18n`:

- **The locale is resolved the same way** — the state, the cookie,
  `requested`, the fallback locale — among `locales`, each of which is in
  `catalogues` or `loaders`; one in neither is a `TypeError`
  ([Troubleshooting](../troubleshooting.md#setuplazynuxti18n-locales-holds-locale-which-is-neither-in-catalogues-nor-in-loaders--give-each-locale-a-catalogue-or-a-loader)).
- **A locale of `loaders` is loaded before the promise resolves**, so the
  server renders in it, never in the fallback locale first. A locale of
  `catalogues` calls no loader.
- **The catalogue the server rendered in travels in the payload**, under
  `CATALOGUE_STATE_KEY` (`null` for a locale of `catalogues`). The browser
  hydrates from it — no loader call, no flash of the fallback locale, no
  hydration mismatch. The page's HTML grows by that one catalogue. Without
  server rendering there is no payload, and the browser calls the loader
  once.
- **`setLocale` writes the state, the cookie and the catalogue state
  together.** On the server, `await setLocale('de')` — from a route
  middleware, say — renders in `de` and hydrates in it. A locale guessed from
  `Accept-Language` is still never written to the cookie.
- **A loader that rejects rejects the plugin**, with `setLocale: the
  catalogue of <locale> could not be loaded`, and Nuxt shows its error page
  ([Troubleshooting](../troubleshooting.md#setlocale-the-catalogue-of-locale-could-not-be-loaded)).

Every composable — `useCookie`, `useState`, `useRequestHeaders` — is called
before the first `await`. `requested` runs before it too, but the header is
read up front to keep every composable visibly before the first `await`.
Anything that needs Nuxt's context after the `await`, as `useHead` does,
goes through `nuxtApp.runWithContext`.

A catalogue a loader answers is never cached per request: a loader that
fetches and answers a new object each time does not grow the server's
memory. Keep the loaders' `import()` paths static, so the bundler makes one
chunk per locale.

## What it does not do

- **No locale in the URL.** There is no `/fr/…` routing, no alternate links,
  no SEO helpers. Read a prefix in your own middleware and call `setLocale`.
- **No lazy loading unless you ask.** Without `lazy`, the module's plugin
  holds every catalogue, so the client bundle does — fine for tens of
  kilobytes. With [`lazy: true`](#what-lazy-generates) it loads every locale
  but the fallback one on demand; to choose which locales load up front,
  write the plugin yourself with
  [`setupLazyNuxtI18n`](#locales-loaded-on-demand).
- **No hot reload of a message.** A catalogue change restarts `nuxt dev`.
