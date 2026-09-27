# @nxgt/i18n-vue — documentation

The [README](../README.md) shows that it works. These pages show how, one area
at a time, with an example for every rule.

| Page | Read it when |
| --- | --- |
| [Catalogues](guide/catalogues.md) | You are writing `locales/<locale>.json`: nesting and kebab-case (camelCase also works), the kinds of argument, what each locale is checked for against the fallback locale, catalogues a package ships, and when the checks run |
| [Vue](guide/vue.md) | You are wiring `createI18n` into a Vue app: the options, `t` in templates and in code, `useI18n`, switching the locale, remembering it, and rendering on a server |
| [Choosing the locale](guide/locale.md) | You want to know how `pickLocale`, `parseAcceptLanguage` and `detectLocale` match a wanted locale to one you have |
| [Types](guide/types.md) | You want the editor to complete `t('…')` and `vue-tsc` to refuse an unknown key or a wrong argument: the Vite plugin, the generated file, what each kind of argument accepts, and a build that is not Vite |
| [Nuxt](guide/nuxt.md) | You use the Nuxt module: its options, how the locale is resolved on the server and hydrated, the cookie, the types under `.nuxt/`, and what it does not do |
| [Outside Vue](guide/translator.md) | You need a message in code with no Vue app — a server, a script, a test — with `createTranslator`, and how it differs from `@nxgt/i18n`'s |
| [Troubleshooting](troubleshooting.md) | You have an error message and want its cause and its fix |
| [Roadmap](roadmap.md) | You want to know what is coming, what shipped, and what is deliberately not planned |
