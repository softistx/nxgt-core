# @nxgt/i18n

Backend-side i18n primitives shared by the Hono/GraphQL services: a tiny ICU
translator (`createTranslator`, `translate`, `getLanguage`), the language
constants (`LANGUAGE_KEY`, `FALLBACK_LANGUAGE`, `SUPPORTED_LANGUAGES`), the
`LocaleKey`/`FlatObject`/`Path` types, and the base resource bundle
(`common`, `errors`, `validation`, `zod`) that every service merges into its own.

## Scope: backend only

The UI apps (`apps/oauth/oauth`, `apps/oauth/oauth-admin`,
`apps/storex/storex-ui`) do **not** use this package. They share their i18n
mechanism through `@nxgt/material/i18n`, which adds the React side this package
deliberately has none of: an `I18nProvider` holding the language in one context
so a `changeLanguage()` re-renders every consumer, and `createTypedTranslation`
to build each app's typed `useTranslation()`. Do not add a frontend consumer
here — extend `@nxgt/material/i18n` instead.

## Consumers

- `apps/gateway`
- `apps/oauth/oauth-api`, `apps/storex/storex-api`
- `apps/services/core`, `apps/services/locations`, `apps/services/notifications`
- `packages/shared-exceptions`, `packages/shared-hono`, `packages/shared-mongo`,
  `packages/shared-storage`

A service builds its own translator over its own resources merged with this
package's base bundle:

```ts
import { createTranslator, resources as shared } from '@nxgt/i18n';

export const resources = {
	en: { ...en, ...shared.en },
	fr: { ...fr, ...shared.fr },
};

export const translate = createTranslator<LocaleKey>(resources);
```
