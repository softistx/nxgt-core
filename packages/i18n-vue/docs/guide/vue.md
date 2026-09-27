# Vue

How to wire `createI18n` into a Vue app, and use `t` and the locale from
templates and code.

## Creating the i18n

```ts
// main.ts
import { createApp } from 'vue';
import { createI18n, detectLocale } from '@nxgt/i18n-vue';
import App from './app.vue';
import en from './locales/en.json';
import fr from './locales/fr.json';

const i18n = createI18n({
	catalogues: { en, fr },
	fallbackLocale: 'en',
	locale: detectLocale(['en', 'fr'], 'en'),
});

createApp(App).use(i18n).mount('#app');
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `catalogues` | `Catalogues` | — (required) | A catalogue per locale, keyed by BCP 47 tag: `{ en, fr, 'pt-BR': ptBR }` |
| `fallbackLocale` | `string` | the first locale of `catalogues` | The reference every other locale is checked against |
| `locale` | `string` | `fallbackLocale` | The locale to start in |

`createI18n` checks the catalogues ([Catalogues](catalogues.md)) and throws on
the first thing that cannot be right. A wrong option is a `TypeError`.

## `t` in a template

`app.use(i18n)` adds `t` to every component's template:

```vue
<template>
	<h1>{{ t('home.title') }}</h1>
	<p>{{ t('home.greeting', { name: user.name }) }}</p>
	<p>{{ t('home.items', { count: cart.length }) }}</p>
	<p>{{ t('home.sentOn', { at: order.sentAt }) }}</p>
	<input :placeholder="t('home.search')" />
</template>
```

The result is text, and `{{ }}` or a bound attribute escapes it. Never pass
it to `v-html`: an argument would be written as markup.

## `useI18n` in code

```vue
<script setup lang="ts">
import { useI18n } from '@nxgt/i18n-vue';
import { computed } from 'vue';

const { t, locale, setLocale } = useI18n();
const heading = computed(() => t('home.greeting', { name: 'Ada' }));
</script>
```

`useI18n()` works wherever `inject` does: a component's `setup`, a
composable called from one, or `app.runWithContext`. With no i18n installed
it throws.

Destructuring is safe: `t` and `setLocale` hold no `this`. `locale` is a
read-only `Ref`, so read `locale.value` in code and `locale` in a template.

## Switching the locale

```ts
const { locale, locales, setLocale } = useI18n();

setLocale('fr'); // every t re-renders in French
locale.value; // 'fr'
locales; // ['en', 'fr']
```

`t` reads the locale reactively: a template, a `computed` or a `watchEffect`
that calls it runs again on a switch. `setLocale` with a locale the
catalogues do not have throws, and the locale does not change. Pass it
something from `locales`, or from `pickLocale`.

## Remembering the choice

`detectLocale` reads `localStorage.language` first. Write the choice there:

```ts
import { watch } from 'vue';

watch(i18n.locale, (locale) => localStorage.setItem('language', locale));
```

Pass `{ storageKey: 'myKey' }` to `detectLocale` to read another key, or
`{ storageKey: false }` to read none.

## A key computed at run time

`t` throws on a key that is not a message. When the key comes from data,
ask first:

```ts
const { t, has } = useI18n();
const label = has(`status.${order.status}`)
	? t(`status.${order.status}`)
	: order.status;
```

## Rendering on a server

Create an i18n **per request**, with the locale the request asks for; one
shared across requests would switch every visitor at once.

```ts
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n, parseAcceptLanguage, pickLocale } from '@nxgt/i18n-vue';
import App from './app.vue';
import en from './locales/en.json';
import fr from './locales/fr.json';

const catalogues = { en, fr };

/** `storedLocale`: the visitor's `language` cookie, read however your server reads cookies. */
export async function render(request: Request, storedLocale: string | null) {
	const locale = pickLocale(
		[storedLocale, ...parseAcceptLanguage(request.headers.get('accept-language'))],
		['en', 'fr'],
		'en',
	);
	const app = createSSRApp(App).use(createI18n({ catalogues, locale }));
	return renderToString(app);
}
```

The catalogues are checked once, not per request: the cache is keyed on
the imported catalogue objects, so `{ en, fr }` wrapped anew still hits it. The browser
must start in the same locale, or Vue reports a hydration mismatch: serialise
it into the page and pass it back to `createI18n` there. The
[Nuxt module](nuxt.md) does all of this.

## A property of your own called `t`

A component whose props, `data` or `setup` bindings have a `t` sees its own
in its template, not the global one. That is what makes
`const { t } = useI18n()` in `<script setup>` work, and it is also how a prop
named `t` silently wins.
