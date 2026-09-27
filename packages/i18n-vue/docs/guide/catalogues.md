# Catalogues

A catalogue is one locale's messages: a JSON object, nested, whose leaves are
[ICU messages](https://unicode-org.github.io/icu/userguide/format_parse/messages/).
The app has one per locale, with the same keys.

```text
locales/
  en.json
  fr.json
```

```json
// locales/en.json
{
	"home": {
		"title": "Welcome",
		"greeting": "Hello {name}",
		"items": "{count, plural, one {# item} other {# items}}",
		"sentOn": "Sent on {at, date, short}",
		"role": "{role, select, admin {Administrator} other {Member}}"
	}
}
```

A message's key is its path, dotted: `home.greeting`.

## Keys are `camelCase`, and nested

Every segment of a key matches `^[a-z][a-zA-Z0-9]*$`, and a dot means a
level, never a character of a key:

```json
{ "home": { "sentOn": "…" } }      // home.sentOn — right
{ "home": { "sent_on": "…" } }     // refused: not camelCase
{ "home.sentOn": "…" }             // refused: a dot is not a segment's
{ "Home": { "title": "…" } }       // refused: starts with a capital
```

A leaf is a string. A number, a boolean, an array or `null` is refused:

```json
{ "home": { "count": 3 } }         // refused: a leaf is a message
```

## Arguments, and their kinds

An argument's kind comes from how the message uses it:

| In the message | Kind | `t` accepts |
| --- | --- | --- |
| `{name}`, `{role, select, …}` | string | a string or a number |
| `{n, number}`, `{n, plural, …}`, `{n, selectordinal, …}` | number | a number |
| `{at, date}`, `{at, time}` | date | a `Date` or a timestamp (a number) |

An argument used as two kinds in one message is refused
(`{n} {n, number}` is fine — a plain use takes the other's kind;
`{n, number} {n, date}` is not). Argument names are `camelCase` too:
`{firstName}`, never `{first_name}`.

Tags are text: `"<b>{name}</b>"` formats to the characters `<b>Ada</b>`,
which Vue then escapes. Write markup in the template, not in a message.

## The fallback locale is the reference

`fallbackLocale` — the first locale unless you say otherwise — declares
every key and every argument. Each other locale is checked against it:

| In another locale | Result |
| --- | --- |
| A key the fallback locale has, missing | refused |
| A key the fallback locale does not have | refused |
| An argument the fallback locale's message does not use | refused |
| An argument used as another kind than the fallback locale's | refused |
| An argument the fallback locale uses, left out | **allowed** — a translation may not need it |

```json
// en.json: "greeting": "Hello {name}"
// fr.json:
"greeting": "Bonjour"          // allowed: {name} left out
"greeting": "Bonjour {nom}"    // refused: en does not declare {nom}
```

`t` checks the arguments you pass against the fallback locale's message,
so the same arguments work in every locale.

## When the checks run

- **At build time**, with `i18nTypes()` for Vite (at `vite dev` and
  `vite build`) or the Nuxt module (at `nuxt dev`, `nuxt build`,
  `nuxt prepare`). The build fails, naming the locale and the key.
- **When the app starts**, in `createI18n`. Its catalogues are checked once
  per object: a server that creates an i18n per request from the same
  imported catalogues checks them once.

`createTranslator` does not check them; call `checkCatalogues` yourself if
you use it alone:

```ts
import { checkCatalogues } from '@nxgt/i18n-vue/core';

checkCatalogues({ en, fr }, ['en', 'fr'], 'en'); // throws, or answers every message by locale
```

## Catalogues from a package

A package can ship messages your app shares — a component library's
`common.cancel`, say — as catalogues by locale. List them in `catalogues`;
each is merged key by key **under** the next, and your own
`locales/<locale>.json` over all of them. A source's locale your app does not
have is left out.

```ts
// vite.config.ts
import { uiCatalogues } from 'some-ui-package';

i18nTypes({ locales: ['en', 'fr'], catalogues: [uiCatalogues] });
```

With Vite, merge the same list at run time, so the app formats what the types
describe:

```ts
import { createI18n, layerCatalogues } from '@nxgt/i18n-vue';
import { uiCatalogues } from 'some-ui-package';

createI18n({ catalogues: layerCatalogues([uiCatalogues], { en, fr }) });
```

The Nuxt module merges them itself: pass `catalogues` in `nxgtI18n` and
nothing else.

## Differences from `@nxgt/i18n`

`@nxgt/i18n`'s own catalogues are nested the same way, but their keys are
kebab-case (`errors.not-found`) and nothing checks them. This package refuses
a kebab-case key, so those catalogues cannot be passed to `createI18n` as they
are.
