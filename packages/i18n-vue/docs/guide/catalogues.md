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

## Keys are kebab-case or camelCase, and nested

The convention is kebab-case — `sign-in`, the one `@nxgt/i18n` uses; camelCase
is still accepted, for a catalogue written before this. A dot means a level,
never a character of a key, and the two conventions are equivalent: a
catalogue written `sign-in` is found by `t('auth.signIn')`, and the other way
round.

```json
{ "home": { "sent-on": "…" } }     // home.sent-on — right, and so is t('home.sentOn')
{ "home": { "sentOn": "…" } }      // home.sentOn — right, and so is t('home.sent-on')
{ "home": { "sent_on": "…" } }     // refused: not kebab-case or camelCase
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

## Splitting catalogues

`locales/<locale>.json` does not have to hold every message. Under `dir`
(default `locales`), a file at `<dir>/<locale>/**/*.json` is read too, and its
**path is a key prefix**: the folder names and the file's own basename, each a
key segment, dotted.

```text
locales/
  en.json               # the keys it always had
  en/
    mails.json           # mails.*
    auth/
      sign-in.json        # auth.sign-in.*
```

```json
// locales/en/mails.json
{ "welcome": { "subject": "Welcome to the app" } }
```

is exactly

```json
// as if locales/en.json held it
{ "mails": { "welcome": { "subject": "Welcome to the app" } } }
```

The file's own content is nested under the prefix as written — kebab-case or
camelCase keys inside it work exactly as in the flat file. A segment of the
path (a folder name or the file's basename) is a key segment too, so it must
be camelCase or kebab-case as well: `en/sign_in.json` is refused, naming the
file.

Only files: `dir` still names one folder, read both ways, for the Vite
plugin and the Nuxt module alike — nothing else to configure. Every locale
must have the same files, at the same paths, as the fallback locale: a file
`en/mails.json` with no `fr/mails.json` **fails the build**, naming the
locale and the file — the same parity a missing flat key already had.

A key defined twice — the flat file and a folder file agreeing on the same
prefix, or two folder files reaching the same key — **fails the build**,
naming both files: pick one place to write it.

```json
// locales/en.json
{ "mails": { "subject": "…" } }
```
```json
// locales/en/mails.json — refused: mails is locales/en.json's already
{ "subject": "…" }
```

## Messages from a module

Instead of `dir`, `messages` names a module — a path from the project's
root — whose default export is the resources object (`{ en: {...}, fr: {...}
}`), or a function that returns one:

```ts
// i18n/messages.ts
import en from './locales/en.json';
import fr from './locales/fr.json';

export default { en, fr };
```

```ts
// vite.config.ts
i18nTypes({ locales: ['en', 'fr'], messages: './i18n/messages.ts' });
```

Import the **same** module in the app, so `createI18n` runs on exactly what
the types were written from:

```ts
// main.ts
import messages from '../i18n/messages';

createI18n({ catalogues: messages });
```

`messages` is loaded with a plain dynamic `import()` — it must be something
your runtime can run directly: a built `.js`/`.mjs` file always works, and so
does `.ts` under Bun or a Node build with native TypeScript support. Neither
Vite nor Nuxt transforms it first, unlike a `dir` catalogue's JSON. Only the
module's own file is watched in `vite dev`; a JSON file it imports does not
trigger a rebuild on its own — put that file directly under `dir` if you want
that, or save the module again once it settles.

## Differences from `@nxgt/i18n`

`@nxgt/i18n`'s own catalogues are nested the same way, kebab-case
(`errors.not-found`), and nothing checks them. This package's catalogues use
the same convention and can be layered with them directly — the only
difference left is that this package checks them: the same keys in every
locale, ICU messages that parse, and arguments that agree.
