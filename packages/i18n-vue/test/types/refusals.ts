/**
 * What `@nxgt/i18n-vue` refuses at COMPILE time, with the types generated
 * from `test/types/locales/` (`generated/i18n.d.ts`).
 *
 * Checked by `bun run typecheck:types` (vue-tsc), never run. Every
 * `@ts-expect-error` here is a refusal that stops holding the moment the
 * directive goes unused — so a refusal that quietly weakens fails the
 * typecheck instead of passing unnoticed. The count is in the README; a
 * count that goes down is a regression.
 *
 * The calls that **must keep compiling** are here too, unmarked: a refusal
 * that refuses the correct call is a bug.
 *
 * **Twenty plausible mistakes, twenty refused.**
 */

import {
	type CatalogueKey,
	createI18n,
	createTranslator,
	detectLocale,
	type Locale,
	pickLocale,
	useI18n,
} from '@nxgt/i18n-vue';
import type { ModuleOptions } from '@nxgt/i18n-vue/nuxt';
import { setupNuxtI18n } from '@nxgt/i18n-vue/nuxt/runtime';
import { i18nTypes } from '@nxgt/i18n-vue/vite';
import { ref } from 'vue';
import en from './locales/en.json';
import fr from './locales/fr.json';

declare const ok: boolean;
declare const computed: string;

// Must keep compiling.
const i18n = createI18n({
	catalogues: { en, fr },
	fallbackLocale: 'en',
	locale: detectLocale(['en', 'fr'], 'en'),
});
i18n.t('home.title');
i18n.t('home.greeting', { name: 'Ada' });
i18n.t('home.greeting', { name: 42 });
i18n.t('home.items', { count: 2 });
i18n.t('home.sentOn', { at: new Date() });
i18n.t('home.sentOn', { at: Date.now() });
i18n.t(ok ? 'home.title' : 'home.action');
i18n.t(ok ? 'home.greeting' : 'home.welcome', { name: 'Ada' });
if (i18n.has(computed)) i18n.t(computed, {});
i18n.setLocale('fr');
const current: 'en' | 'fr' = i18n.locale.value;
const locale: Locale = 'fr';
const { t } = useI18n();
t('home.title');
const translate = createTranslator({ en, fr }, () => 'en');
translate('home.greeting', { name: 'Ada' }, 'fr');
const custom = createTranslator<CatalogueKey<typeof en>>({ en }, 'en');
custom('home.items', { count: 1 });
const picked: 'en' | 'fr' = pickLocale('fr-CA', ['en', 'fr'], 'en');
i18nTypes({
	locales: ['en', 'fr'],
	dir: 'src/locales',
	out: 'src/generated/i18n.d.ts',
});
const options: ModuleOptions = { locales: ['en', 'fr'], cookie: 'lang' };
setupNuxtI18n({
	catalogues: { en, fr },
	fallbackLocale: 'en',
	cookie: ref<string | null | undefined>(null),
	state: ref<string | undefined>(),
	requested: () => 'fr',
});

// 1. A key the catalogues do not have.
// @ts-expect-error — 'home.title'.
i18n.t('home.titel');

// 2. A message's argument left out.
// @ts-expect-error — { name }.
i18n.t('home.greeting');

// 3. An argument the message does not use.
// @ts-expect-error — home.title takes none.
i18n.t('home.title', { name: 'Ada' });

// 4. A plural's count given as text.
// @ts-expect-error — a number.
i18n.t('home.items', { count: '2' });

// 5. A date given as text.
// @ts-expect-error — a Date or a timestamp.
i18n.t('home.sentOn', { at: 'today' });

// 6. An argument that is an object.
// @ts-expect-error — a string or a number.
i18n.t('home.greeting', { name: { first: 'Ada' } });

// 7. A key that may be a message without arguments or one with.
// @ts-expect-error — both must take the same arguments.
i18n.t(ok ? 'home.title' : 'home.items');

// 8. The same, given the arguments of only one of them.
// @ts-expect-error — { count } is not home.greeting's.
i18n.t(ok ? 'home.greeting' : 'home.items', { count: 1 });

// 9. A key written in snake_case: every key is camelCase.
// @ts-expect-error — 'home.sentOn'.
i18n.t('home.sent_on');

// 10. A locale the catalogues do not have.
// @ts-expect-error — 'en' or 'fr'.
i18n.setLocale('de');

// 11. The locale assigned, past setLocale's check.
// @ts-expect-error — setLocale('fr').
i18n.locale.value = 'fr';

// 12. createI18n without catalogues.
// @ts-expect-error — catalogues is required.
createI18n({ locale: 'fr' });

// 13. A catalogue with a leaf that is not a message.
// @ts-expect-error — a leaf is an ICU string.
createI18n({ catalogues: { en: { home: { count: 3 } } } });

// 14. The standalone translator, given a key it does not have.
// @ts-expect-error — 'home.greeting'.
translate('home.greting', { name: 'Ada' });

// 15. A language per call that is not a locale.
// @ts-expect-error — a locale, or a function that answers one.
translate('home.title', {}, 1);

// 16. A language provider that answers nothing usable.
// @ts-expect-error — a locale, or a function that answers one.
createTranslator({ en }, 1);

// 17. A fallback that is not one of the supported locales.
// @ts-expect-error — 'en' or 'fr'.
pickLocale('fr', ['en', 'fr'], 'de');

// 18. The Vite plugin without locales.
// @ts-expect-error — locales is required.
i18nTypes({ out: 'src/generated/i18n.d.ts' });

// 19. One locale as a string.
// @ts-expect-error — locales is a list.
i18nTypes({ locales: 'en' });

// 20. A cookie that is not a name.
// @ts-expect-error — cookie: 'language'.
const badCookie: ModuleOptions = { locales: ['en'], cookie: 1 };

export { badCookie, current, locale, options, picked };
