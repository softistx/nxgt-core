# Outside Vue

`@nxgt/i18n-vue/core` holds everything that is not Vue, and imports no
`vue`: a server, a worker, a script or a test uses it alone.

## `createTranslator(catalogues, getLanguage)`

```ts
import { createTranslator } from '@nxgt/i18n-vue/core';
import en from './locales/en.json';
import fr from './locales/fr.json';

const t = createTranslator({ en, fr }, () => currentUser().locale);

t('home.title');
t('home.greeting', { name: 'Ada' });
t('home.greeting', { name: 'Ada' }, 'fr'); // a language for this call only
t('home.greeting', { name: 'Ada' }, () => 'fr'); // or a function that answers one
```

`getLanguage` is a locale, or a function called at each `t`, as in
`@nxgt/i18n`. Anything else is a `TypeError`, as are catalogues that are not
an object.

## How it differs from `@nxgt/i18n`'s

| | `@nxgt/i18n` | `@nxgt/i18n-vue` |
| --- | --- | --- |
| A key the language's catalogue does not have | answers the key | **throws** `t: fr: home.titel is not a key` |
| A language with no catalogue | formats the key | **throws**, without naming the language |
| A message that does not format | logs, answers the unformatted text | **throws** `t: en: home.greeting could not be formatted`, the formatter's error as `cause` |
| Tags in a message | parsed | text (`ignoreTag`) |
| Default language | the Hono request, then `localStorage` | none: you pass it |
| Imports | `hono`, `lodash` | `intl-messageformat` and its parser |

`createTranslator` looks a message up and formats it. It does not check the
catalogues or the arguments; `createI18n` does both. To check them without
Vue:

```ts
import { checkArguments, checkCatalogues } from '@nxgt/i18n-vue/core';

const messages = checkCatalogues({ en, fr }, ['en', 'fr'], 'en');
const reference = messages.get('en')!;
checkArguments('notify', 'home.greeting', reference.get('home.greeting')!, { name: 'Ada' });
// throws `notify: home.greeting needs {name}` when name is left out
```

## Its keys

With the generated types ([Types](types.md)), `t` takes the registered keys
and their arguments. Without them, name the keys from the catalogue's own
type:

```ts
import { type CatalogueKey, createTranslator } from '@nxgt/i18n-vue/core';

const t = createTranslator<CatalogueKey<typeof en>>({ en, fr }, 'en');
```

## The pieces

| Export | What it is |
| --- | --- |
| `lookup(catalogue, key)` | The message at a dotted key, or `null` |
| `createFormatter(prefix)` | Formats `(locale, key, text, args)`, with a cache of compiled messages; a failure throws `<prefix>: <locale>: <key> could not be formatted` |
| `checkCatalogues(catalogues, locales, fallbackLocale)` | Checks the catalogues, and answers every message by locale then key, with its arguments' kinds |
| `layerCatalogues(sources, project)` | Merges catalogues a package ships under yours |
| `checkArguments(where, key, message, args)` | Checks the arguments of one call against the fallback locale's message |
