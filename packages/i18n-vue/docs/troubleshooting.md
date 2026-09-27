# Troubleshooting `@nxgt/i18n-vue`

Each entry is headed by the message you see. Search this page for the words
of your message; the parts in `<angle brackets>` are what varies. The last
section holds the traps that throw nothing.

How the messages are shaped:

- **A wiring mistake is a `TypeError`**, from the call you wrote:
  `createI18n: …`, `createTranslator: …`, `pickLocale: …`, `detectLocale: …`,
  `i18nTypes: …` when Vite loads its config, `nxgtI18n: …` when Nuxt starts.
  Fix the call.
- **A catalogue that cannot be right is an `Error` starting `i18n:`**, naming
  the locale and the key. It is raised by the Vite plugin or the Nuxt module
  at build time, and by `createI18n` when the app starts.
- **A call to `t` that cannot be right is an `Error` starting `t:`** — or a
  `TypeError` when an argument has the wrong type. With the generated types,
  the type checker reports each of these first.
- **Called directly, `checkArguments` and `createFormatter` start their
  messages with your own `where` or `prefix`** where these entries show `t:`:
  `checkArguments('notify', …)` throws `notify: home.greeting needs {name}`.
- **No message holds a value you passed**: a key, a locale code from the
  catalogues and an argument's name, never an argument's value or a locale
  that came from a request.

The samples use the locales `en` (the fallback locale) and `fr`, and keys such
as `home.greeting`.

## Index

**Wiring**
- [`createI18n: options must be an object, as { catalogues: { en, fr } }`](#createi18n-options-must-be-an-object-as--catalogues--en-fr--)
- [`createI18n: catalogues must be an object of catalogues by locale, as { en, fr }`](#createi18n-catalogues-must-be-an-object-of-catalogues-by-locale-as--en-fr-)
- [`createI18n: catalogues must hold at least one locale, as { en, fr }`](#createi18n-catalogues-must-hold-at-least-one-locale-as--en-fr-)
- [`createI18n: catalogues holds something that is not a locale — …`](#createi18n-catalogues-holds-something-that-is-not-a-locale--key-each-catalogue-by-a-bcp-47-tag-as-en-or-pt-br)
- [`createI18n: fallbackLocale must be a locale of the catalogues`](#createi18n-fallbacklocale-must-be-a-locale-of-the-catalogues)
- [`createI18n: locale must be a locale of the catalogues — pick one with pickLocale`](#createi18n-locale-must-be-a-locale-of-the-catalogues--pick-one-with-picklocale)
- [`createTranslator: catalogues must be an object of catalogues by locale, as { en, fr }`](#createtranslator-catalogues-must-be-an-object-of-catalogues-by-locale-as--en-fr-)
- [`createTranslator: getLanguage must be a locale or a function that answers one`](#createtranslator-getlanguage-must-be-a-locale-or-a-function-that-answers-one)
- [`pickLocale: supported must hold at least one locale`](#picklocale-supported-must-hold-at-least-one-locale)
- [`pickLocale: fallback must be one of supported`](#picklocale-fallback-must-be-one-of-supported)
- [`detectLocale: storageKey must be a localStorage key, or false to read none`](#detectlocale-storagekey-must-be-a-localstorage-key-or-false-to-read-none)
- [`<i18nTypes|nxgtI18n>: options must be an object, as { locales: ['en', 'fr'] }`](#i18ntypesnxgti18n-options-must-be-an-object-as--locales-en-fr-)
- [`<i18nTypes|nxgtI18n>: locales must hold at least one locale, as ['en', 'fr']`](#i18ntypesnxgti18n-locales-must-hold-at-least-one-locale-as-en-fr)
- [`<i18nTypes|nxgtI18n>: locales holds something that is not a locale — write each as a BCP 47 tag, as en or pt-BR`](#i18ntypesnxgti18n-locales-holds-something-that-is-not-a-locale--write-each-as-a-bcp-47-tag-as-en-or-pt-br)
- [`<i18nTypes|nxgtI18n>: locales holds the same locale twice`](#i18ntypesnxgti18n-locales-holds-the-same-locale-twice)
- [`<i18nTypes|nxgtI18n>: fallbackLocale must be one of locales`](#i18ntypesnxgti18n-fallbacklocale-must-be-one-of-locales)
- [`<i18nTypes|nxgtI18n>: dir must be a folder of the project`](#i18ntypesnxgti18n-dir-must-be-a-folder-of-the-project)
- [`<i18nTypes|nxgtI18n>: messages must be a module path, as './i18n/messages.ts'`](#i18ntypesnxgti18n-messages-must-be-a-module-path-as-i18nmessagests)
- [`<i18nTypes|nxgtI18n>: dir and messages cannot both be set — messages replaces the folder`](#i18ntypesnxgti18n-dir-and-messages-cannot-both-be-set--messages-replaces-the-folder)
- [`<i18nTypes|nxgtI18n>: catalogues must be a list of catalogues by locale, as [{ en: {...}, fr: {...} }]`](#i18ntypesnxgti18n-catalogues-must-be-a-list-of-catalogues-by-locale-as--en--fr--)
- [`i18nTypes: out must be the path of a .d.ts file, as src/generated/i18n.d.ts`](#i18ntypes-out-must-be-the-path-of-a-dts-file-as-srcgeneratedi18ndts)
- [`nxgtI18n: cookie must be a cookie name, as 'language'`](#nxgti18n-cookie-must-be-a-cookie-name-as-language)

**Catalogues**
- [`i18n: <dir>/<locale>.json is missing — every locale has a catalogue`](#i18n-dirlocalejson-is-missing--every-locale-has-a-catalogue)
- [`i18n: <dir>/<locale>.json is not valid JSON`](#i18n-dirlocalejson-is-not-valid-json)
- [`i18n: <locale>: the catalogue must be an object of messages`](#i18n-locale-the-catalogue-must-be-an-object-of-messages)
- [`i18n: <dir>/<locale>.json must be an object of messages`](#i18n-dirlocalejson-must-be-an-object-of-messages)
- [`i18n: <dir>/<locale>/<file> must be an object of messages`](#i18n-dirlocalefile-must-be-an-object-of-messages)
- [`i18n: <dir>/<locale>/<file>: <segment> is not camelCase or kebab-case — a file path segment is a key segment too, as mails or sign-in`](#i18n-dirlocalefile-segment-is-not-camelcase-or-kebab-case--a-file-path-segment-is-a-key-segment-too-as-mails-or-sign-in)
- [`i18n: <locale>: <key> is defined by both <file> and <file>`](#i18n-locale-key-is-defined-by-both-file-and-file)
- [`i18n: <dir>/<locale>/<file> is missing — <dir>/<fallback>/<file> exists`](#i18n-dirlocalefile-is-missing--dirfallbackfile-exists)
- [`i18n: <dir>/<locale>/<file> exists, and <dir>/<fallback>/<file> does not — every locale has the same files`](#i18n-dirlocalefile-exists-and-dirfallbackfile-does-not--every-locale-has-the-same-files)
- [`i18n: <path> could not be loaded (<reason>)`](#i18n-path-could-not-be-loaded-reason)
- [`i18n: <path>'s default export could not be run (<reason>)`](#i18n-paths-default-export-could-not-be-run-reason)
- [`i18n: <path> has no default export — export the resources object, or a function that returns it`](#i18n-path-has-no-default-export--export-the-resources-object-or-a-function-that-returns-it)
- [`i18n: <path>'s default export must be a resources object ({ en: {...}, fr: {...} }) or a function that returns one`](#i18n-paths-default-export-must-be-a-resources-object--en--fr---or-a-function-that-returns-one)
- [`i18n: <path> is missing the <locale> locale`](#i18n-path-is-missing-the-locale-locale)
- [`i18n: <locale>: <key> is not camelCase or kebab-case — …`](#i18n-locale-key-is-not-camelcase-or-kebab-case--every-segment-of-a-key-is-one-or-the-other-and-nested-rather-than-dotted-as-verifyemailtitle-or-verify-emailtitle)
- [`i18n: <locale>: <key> must be a message (a string) or an object of messages`](#i18n-locale-key-must-be-a-message-a-string-or-an-object-of-messages)
- [`i18n: <locale>: <key> is not a valid ICU message (<reason>)`](#i18n-locale-key-is-not-a-valid-icu-message-reason)
- [`i18n: <locale>: <key> uses {<name>}, which is not camelCase — …`](#i18n-locale-key-uses-name-which-is-not-camelcase--an-argument-is-a-camelcase-name-as-firstname)
- [`i18n: <locale>: <key> uses {<name>} as <kind> and as <kind>`](#i18n-locale-key-uses-name-as-kind-and-as-kind)
- [`i18n: <locale>: <key> is missing — <fallback>, the fallback locale, has it`](#i18n-locale-key-is-missing--fallback-the-fallback-locale-has-it)
- [`i18n: <locale>: <key> is not a key of <fallback>, the fallback locale`](#i18n-locale-key-is-not-a-key-of-fallback-the-fallback-locale)
- [`i18n: <locale>: <key> uses {<name>}, which <fallback> does not declare`](#i18n-locale-key-uses-name-which-fallback-does-not-declare)
- [`i18n: <locale>: <key> uses {<name>} as <kind>, and <fallback> declares it as <kind>`](#i18n-locale-key-uses-name-as-kind-and-fallback-declares-it-as-kind)
- [`i18n: <path> was not written by @nxgt/i18n-vue — point the types at a file of their own`](#i18n-path-was-not-written-by-nxgti18n-vue--point-the-types-at-a-file-of-their-own)

**At run time**
- [`t: <key> is not a key of the catalogues`](#t-key-is-not-a-key-of-the-catalogues)
- [`t: <key> needs {<name>}`](#t-key-needs-name)
- [`t: <key> does not use {<name>}`](#t-key-does-not-use-name)
- [`t: <key> takes its arguments as an object, as { name: 'Ada' }`](#t-key-takes-its-arguments-as-an-object-as--name-ada-)
- [`t: <key> is given {<name>} as a <type> — the message uses it as a <kind>`](#t-key-is-given-name-as-a-type--the-message-uses-it-as-a-kind)
- [`t: <locale>: <key> could not be formatted`](#t-locale-key-could-not-be-formatted)
- [`t: <locale>: <key> is not a key`](#t-locale-key-is-not-a-key)
- [`t: the language is not a locale of the catalogues — pick one with pickLocale`](#t-the-language-is-not-a-locale-of-the-catalogues--pick-one-with-picklocale)
- [`t: the key must be a string, as t('home.title')`](#t-the-key-must-be-a-string-as-thometitle)
- [`t: the language must be a string — a locale, or a function that answers one`](#t-the-language-must-be-a-string--a-locale-or-a-function-that-answers-one)
- [`setLocale: the locale must be a string, as fr`](#setlocale-the-locale-must-be-a-string-as-fr)
- [`setLocale: the locale is not a locale of the catalogues — pick one with pickLocale`](#setlocale-the-locale-is-not-a-locale-of-the-catalogues--pick-one-with-picklocale)
- [`useI18n: no i18n is installed — …`](#usei18n-no-i18n-is-installed--appusecreatei18n-catalogues--first-in-a-component-or-where-inject-works)

**Traps that throw nothing**
- [`t('…')` takes any string: no completion, no type error](#t-takes-any-string-no-completion-no-type-error)
- [The page hydrates in another language, or Vue warns of a hydration mismatch](#the-page-hydrates-in-another-language-or-vue-warns-of-a-hydration-mismatch)
- [Every visitor switches language when one does](#every-visitor-switches-language-when-one-does)
- [A component's `t` is not the i18n's](#a-components-t-is-not-the-i18ns)
- [A message shows `<b>` as text](#a-message-shows-b-as-text)

---

## Wiring

### `createI18n: options must be an object, as { catalogues: { en, fr } }`

`createI18n` was called with nothing, or with something that is not an
object.

```ts
createI18n({ catalogues: { en, fr } });
```

### `createI18n: catalogues must be an object of catalogues by locale, as { en, fr }`

`catalogues` is missing, or one of its values is not an object — a JSON file
imported as a string, or a single catalogue passed where one per locale is
expected.

```ts
createI18n({ catalogues: en }); // wrong: one catalogue
createI18n({ catalogues: { en, fr } }); // right
```

### `createI18n: catalogues must hold at least one locale, as { en, fr }`

`catalogues` is `{}`. Pass at least the fallback locale's.

### `createI18n: catalogues holds something that is not a locale — key each catalogue by a BCP 47 tag, as en or pt-BR`

A key of `catalogues` is not a lower-case language tag with optional
subtags: `English`, `EN`, `fr_FR`. Use `en`, `fr-FR`, `pt-BR`.

```ts
createI18n({ catalogues: { en, 'pt-BR': ptBR } });
```

### `createI18n: fallbackLocale must be a locale of the catalogues`

`fallbackLocale` names a locale `catalogues` does not have. Add its catalogue
or name another.

### `createI18n: locale must be a locale of the catalogues — pick one with pickLocale`

The start `locale` is not one of the catalogues — usually a raw value from a
cookie, `navigator.language` or a user's profile. Match it first:

```ts
createI18n({ catalogues, locale: pickLocale(user.locale, ['en', 'fr'], 'en') });
```

### `createTranslator: catalogues must be an object of catalogues by locale, as { en, fr }`

`createTranslator`'s first argument is `null` or not an object.

```ts
createTranslator({ en, fr }, 'en');
```

### `createTranslator: getLanguage must be a locale or a function that answers one`

The second argument is neither a string nor a function.

```ts
createTranslator({ en, fr }, () => user.locale);
```

### `pickLocale: supported must hold at least one locale`

`pickLocale(wanted, [], fallback)`. Pass the locales of your catalogues.

### `pickLocale: fallback must be one of supported`

The third argument is not in the second: `pickLocale(x, ['en', 'fr'], 'de')`.
With literal lists this is a type error first.

### `detectLocale: storageKey must be a localStorage key, or false to read none`

`storageKey` is `''` or not a string. Leave it out for `'language'`, or pass
`false` to skip the stored preference.

The Vite plugin and the Nuxt module take the same options and refuse them with the same messages, prefixed by who is refusing: `i18nTypes` in `vite.config.ts`, `nxgtI18n` in `nuxt.config.ts`. The entries below write the prefix as `<i18nTypes|nxgtI18n>`.

### `<i18nTypes|nxgtI18n>: options must be an object, as { locales: ['en', 'fr'] }`

`i18nTypes()` was called with nothing or with something that is not an object. Under Nuxt this does not happen: a missing `nxgtI18n` arrives as `{}`, and the next entry is what you see.

```ts
i18nTypes({ locales: ['en', 'fr'] });
```

### `<i18nTypes|nxgtI18n>: locales must hold at least one locale, as ['en', 'fr']`

`locales` is missing, empty, or a string. Under Nuxt, a missing `nxgtI18n` in `nuxt.config.ts` lands here.

```ts
nxgtI18n: { locales: ['en', 'fr'] }
```

### `<i18nTypes|nxgtI18n>: locales holds something that is not a locale — write each as a BCP 47 tag, as en or pt-BR`

A locale is not a lower-case language tag: `EN`, `pt_BR`, `English`. Write `en`, `pt-BR`.

### `<i18nTypes|nxgtI18n>: locales holds the same locale twice`

Remove the duplicate from `locales`.

### `<i18nTypes|nxgtI18n>: fallbackLocale must be one of locales`

Name one of `locales`, or leave `fallbackLocale` out for the first.

### `<i18nTypes|nxgtI18n>: dir must be a folder of the project`

`dir` is empty or not a string. Give a path from the root, as `'locales'` or `'src/locales'`.

### `<i18nTypes|nxgtI18n>: messages must be a module path, as './i18n/messages.ts'`

`messages` is `''` or not a string. Give a path from the root, as
`'./i18n/messages.ts'`.

### `<i18nTypes|nxgtI18n>: dir and messages cannot both be set — messages replaces the folder`

Both `dir` and `messages` were passed. Pick one: `messages` reads the
resources object a module exports, and does not also read a folder.

### `<i18nTypes|nxgtI18n>: catalogues must be a list of catalogues by locale, as [{ en: {...}, fr: {...} }]`

One package's catalogues were passed without the list, or a value is not an object by locale. Wrap them:

```ts
i18nTypes({ locales: ['en', 'fr'], catalogues: [uiCatalogues] });
```

### `i18nTypes: out must be the path of a .d.ts file, as src/generated/i18n.d.ts`

`out` does not end in `.d.ts`. A `.ts` file would be compiled as a module
that exports nothing; the types would still apply, but only a `.d.ts` says
what the file is.

### `nxgtI18n: cookie must be a cookie name, as 'language'`

`cookie` holds a space, `;`, `=` or another character a cookie name cannot
have, or is not a string. Letters, digits and `-_.` are safe:

```ts
nxgtI18n: { locales: ['en', 'fr'], cookie: 'app_locale' }
```

## Catalogues

### `i18n: <dir>/<locale>.json is missing — every locale has a catalogue`

The Vite plugin or the Nuxt module looked for `locales/fr.json` (or your
`dir`) from the project's root and found neither it nor any
`locales/fr/**/*.json`. Under Nuxt the root is `rootDir`, next to
`nuxt.config.ts`, not `app/`. Create a file, or remove the locale from
`locales`. Folder files alone are enough — the flat file is not required
once at least one exists.

### `i18n: <dir>/<locale>.json is not valid JSON`

The file does not parse: a trailing comma, a comment, a missing quote. The
message does not repeat the parser's, which would quote the file; run it
through any JSON validator.

### `i18n: <locale>: the catalogue must be an object of messages`

The catalogue of `<locale>` is not a JSON object: an array, a string, `null`.

### `i18n: <dir>/<locale>.json must be an object of messages`

The flat file parses, but its top level is not a JSON object — an array, a
string, `null`. Same rule as above, caught earlier, naming the file rather
than the locale.

### `i18n: <dir>/<locale>/<file> must be an object of messages`

A folder file parses, but its top level is not a JSON object. The whole file
becomes the prefix's content, so it must be one.

### `i18n: <dir>/<locale>/<file>: <segment> is not camelCase or kebab-case — a file path segment is a key segment too, as mails or sign-in`

A folder file's path (`<dir>/<locale>/**/*.json`) has a segment with `_`, a
leading capital, or a hyphen that is leading, trailing or doubled — a folder
name or the file's own basename, same rule as a catalogue key:

```text
locales/en/sign_in.json    // wrong: underscore
locales/en/sign-in.json    // right — becomes sign-in.*
```

### `i18n: <locale>: <key> is defined by both <file> and <file>`

Two sources define the same key: `locales/en.json` already has `mails` and
`locales/en/mails.json` also exists, or two folder files reach the same
prefix (`locales/en/mails.json` and `locales/en/mails/welcome.json`, whether
or not `welcome` also happens to be one of `mails.json`'s own keys). A file's
own prefix is its alone — nothing else may add to it. Keep the message in one
place. See [Splitting catalogues](catalogues.md#splitting-catalogues).

### `i18n: <dir>/<locale>/<file> is missing — <dir>/<fallback>/<file> exists`

The fallback locale has a folder file another locale does not. Add it there,
even if only to leave the message untranslated for now — a file is checked
for parity the way a key already was.

### `i18n: <dir>/<locale>/<file> exists, and <dir>/<fallback>/<file> does not — every locale has the same files`

A locale has a folder file the fallback locale does not. Add the same file
to the fallback locale, or remove it here.

### `i18n: <path> could not be loaded (<reason>)`

The `messages` module itself failed to import — a syntax error, a missing
import of its own, or a path that does not resolve. `<reason>` is the
underlying error's message; the module is also the `cause`.

### `i18n: <path>'s default export could not be run (<reason>)`

The `messages` module's default export is a function, and calling it threw
or its promise rejected. `<reason>` is the underlying error's message; it is
also the `cause`.

### `i18n: <path> has no default export — export the resources object, or a function that returns it`

A `messages` module has no `default` export. Export the resources object, or
a function that answers one:

```ts
export default { en, fr };
```

### `i18n: <path>'s default export must be a resources object ({ en: {...}, fr: {...} }) or a function that returns one`

The default export (or what the function answered) is not an object of
catalogues by locale — `null`, a single catalogue, an array.

### `i18n: <path> is missing the <locale> locale`

A `messages` module's resources object has no key for one of `locales`. Add
it there, or remove the locale from `locales`.

### `i18n: <locale>: <key> is not camelCase or kebab-case — every segment of a key is one or the other, and nested rather than dotted, as verifyEmail.title or verify-email.title`

A key has a segment with `_`, a dot, a leading capital, or a hyphen that is
leading, trailing or doubled:

```json
{ "home": { "sent_on": "…" } }   // wrong: underscore
{ "home.sentOn": "…" }           // wrong: nest it
{ "home": { "sentOn": "…" } }    // right — camelCase
{ "home": { "sent-on": "…" } }   // right — kebab-case
```

`@nxgt/i18n`'s own catalogues, kebab-case (`errors.not-found`), check clean
here.

### `i18n: <locale>: <key> must be a message (a string) or an object of messages`

A leaf is a number, a boolean, an array or `null`. Write it as text: `"3"`,
or better a message with an argument.

### `i18n: <locale>: <key> is not a valid ICU message (<reason>)`

The message does not parse as ICU; the reason is the parser's. The usual
causes:

- an unbalanced `{` or `}`;
- a `plural` or `select` without an `other` case;
- an apostrophe that starts a quoted section — in ICU, `'{'` is a literal
  brace, so write a lone apostrophe as `''` next to a brace or use `’`.

```json
"items": "{count, plural, one {# item} other {# items}}"
```

### `i18n: <locale>: <key> uses {<name>}, which is not camelCase — an argument is a camelCase name, as {firstName}`

Rename the argument: `{first_name}` → `{firstName}`, in every locale.

### `i18n: <locale>: <key> uses {<name>} as <kind> and as <kind>`

One message uses an argument as a number and as a date, say
(`{n, number} … {n, date}`). Use two arguments.

### `i18n: <locale>: <key> is missing — <fallback>, the fallback locale, has it`

`<locale>` lacks a key the fallback locale has. Translate it:

```json
// fr.json
{ "home": { "greeting": "Bonjour {name}" } }
```

### `i18n: <locale>: <key> is not a key of <fallback>, the fallback locale`

`<locale>` has a key the fallback locale does not: a typo, or a key removed
from the fallback locale and left in the others. The fallback locale declares
every key; add it there or remove it here.

### `i18n: <locale>: <key> uses {<name>}, which <fallback> does not declare`

A translation uses an argument the fallback locale's message does not — often
a translated argument name (`{nom}` for `{name}`). Argument names are code:
keep them as the fallback locale writes them. A translation may leave one
out, never add one.

### `i18n: <locale>: <key> uses {<name>} as <kind>, and <fallback> declares it as <kind>`

The translation uses an argument as another kind — `{at, number}` where the
fallback locale has `{at, date}`, say. Use it as the fallback locale does.

### `i18n: <path> was not written by @nxgt/i18n-vue — point the types at a file of their own`

The Vite plugin's `out` is a file that exists and was not written by
`typesSource`: its first two lines are not a generated file's header, so it
is yours. The plugin never replaces it. Point `out`
elsewhere, or delete the file if it is a stale copy.

## At run time

### `t: <key> is not a key of the catalogues`

`t` got a key the fallback locale does not have: a typo, a key built at run
time, or a key removed from the catalogues. With the generated types a
literal key is a type error first. For a key built from data, ask first:

```ts
const { t, has } = useI18n();
has(`status.${status}`) ? t(`status.${status}`) : status;
```

### `t: <key> needs {<name>}`

The message uses `{name}` and the call does not pass it.

```ts
t('home.greeting', { name: user.name });
```

### `t: <key> does not use {<name>}`

The call passes an argument the message never uses — often a message that
changed. Remove the argument, or add it to the message in every locale.

### `t: <key> takes its arguments as an object, as { name: 'Ada' }`

A `TypeError`: the second argument is a string, an array or `null`.

```ts
t('home.greeting', 'Ada'); // wrong
t('home.greeting', { name: 'Ada' }); // right
```

### `t: <key> is given {<name>} as a <type> — the message uses it as a <kind>`

A `TypeError`: a plural's count given as a string, a date given as text,
`null` for anything. Convert it:

```ts
t('home.items', { count: Number(input.value) });
t('home.sentOn', { at: new Date(order.sentAt) });
```

What each kind accepts is in [Catalogues](guide/catalogues.md#arguments-and-their-kinds).

### `t: <locale>: <key> could not be formatted`

The message parsed, but formatting it failed in `<locale>` — usually an
argument missing for `createTranslator`, which does not check arguments, or
a date that is not a valid date. The formatter's own error is the `cause`:

```ts
try {
	t('home.sentOn', { at });
} catch (error) {
	console.error(error, (error as Error).cause);
}
```

### `t: <locale>: <key> is not a key`

From `createTranslator`: the language's catalogue has no message at that
key. It is not checked against the other locales, so check them with
`checkCatalogues` ([Outside Vue](guide/translator.md)).

### `t: the language is not a locale of the catalogues — pick one with pickLocale`

From `createTranslator`: the language — fixed, per call, or answered by
`getLanguage` — has no catalogue. Match it first:

```ts
createTranslator({ en, fr }, () => pickLocale(user.locale, ['en', 'fr'], 'en'));
```

### `t: the key must be a string, as t('home.title')`

A `TypeError`: `t` got a number, `undefined` or an object as its key — usually a key read from data that was not there. With the generated types this is a type error first.

```ts
t(String(key)); // only if the value is a key; ask has(key) first
```

### `t: the language must be a string — a locale, or a function that answers one`

A `TypeError`, from `createTranslator`: the language — fixed, per call, or answered by `getLanguage` — is not a string, often a function that answers `undefined` for a user with no locale. Match it first:

```ts
createTranslator({ en, fr }, () => pickLocale(user.locale, ['en', 'fr'], 'en'));
```

### `setLocale: the locale must be a string, as fr`

A `TypeError`: `setLocale` got something that is not a string — an event instead of its value, say. The locale is unchanged.

```ts
setLocale((event.target as HTMLSelectElement).value as Locale);
```

### `setLocale: the locale is not a locale of the catalogues — pick one with pickLocale`

`setLocale` got a locale the catalogues do not have; the locale is
unchanged. Pass one of `locales`, or `pickLocale(value, locales, locale.value)`.

### `useI18n: no i18n is installed — app.use(createI18n({ catalogues })) first, in a component or where inject works`

`useI18n()` found nothing to inject. Either the app never called
`app.use(createI18n(…))`, or `useI18n()` runs outside a component's `setup`
— a module's top level, a `setTimeout`, a Pinia store created outside the
app. Call it inside `setup`, or inside `app.runWithContext(() => …)`. Under
Nuxt, the module installs it: check `@nxgt/i18n-vue/nuxt` is in `modules`.

## Traps that throw nothing

### `t('…')` takes any string: no completion, no type error

The generated file is missing, or not in the program:

- **Vite** — start Vite once (`vite build` or `vite dev`) so
  `src/generated/i18n.d.ts` exists, and check your `tsconfig.json`'s
  `include` covers it. In CI, build before `vue-tsc`.
- **Nuxt** — run `nuxt prepare` (the `postinstall` of a Nuxt project), and
  keep the `tsconfig.json` Nuxt generates, which references `.nuxt/`.
- A file of your own that declares `module '@nxgt/i18n-vue'` with an empty
  `I18nMessages` does no harm; one with other keys adds them.

### The page hydrates in another language, or Vue warns of a hydration mismatch

The browser chose a locale on its own. In a server-rendered app, never call
`detectLocale` or read `navigator.languages` to start the client: resolve on
the server, pass the result to the client, and start `createI18n` with it.
The Nuxt module does this through the payload; if you wrap its plugin, do not
call `setLocale` in the browser before hydration ends.

### Every visitor switches language when one does

One i18n is shared by every request of a server. Create one per request
(`createI18n` in the function that renders), as the Nuxt module does.

### A component's `t` is not the i18n's

A prop, a `data` field or a `setup` binding named `t` hides the global `t` in
that component's template. Rename it, or use `useI18n().t` explicitly.

### A message shows `<b>` as text

Tags are text by design: messages are escaped like any other text. Put the
markup in the template and the words in messages:

```vue
<p>{{ t('home.before') }} <strong>{{ t('home.important') }}</strong></p>
```
