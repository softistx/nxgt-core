import { describe, expect, test } from 'bun:test';
import { ref } from 'vue';
import { setupNuxtI18n } from './index';

const catalogues = {
	en: { home: { title: 'Welcome' } },
	fr: { home: { title: 'Bienvenue' } },
	'pt-BR': { home: { title: 'Bem-vindo' } },
};

/** Nuxt's composables, as plain refs: one request, or one browser. */
function context(options: {
	cookie?: string | null;
	state?: string;
	requested?: string | readonly string[] | null;
}) {
	return {
		catalogues,
		fallbackLocale: 'en',
		cookie: ref<string | null | undefined>(options.cookie),
		state: ref<string | undefined>(options.state),
		requested: () => options.requested,
	};
}

describe('setupNuxtI18n on the server', () => {
	test('prefers the cookie to Accept-Language', () => {
		const ctx = context({ cookie: 'fr', requested: 'pt-BR,en;q=0.5' });
		const i18n = setupNuxtI18n(ctx);
		expect(i18n.locale.value).toBe('fr');
		expect(ctx.state.value).toBe('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
	});

	test('reads Accept-Language when there is no cookie, or one that is no locale', () => {
		expect(
			setupNuxtI18n(context({ requested: 'de, pt;q=0.8' })).locale.value,
		).toBe('pt-BR');
		expect(
			setupNuxtI18n(context({ cookie: 'klingon', requested: 'fr-CA' })).locale
				.value,
		).toBe('fr');
	});

	test('answers the fallback locale when nothing matches', () => {
		expect(setupNuxtI18n(context({ requested: null })).locale.value).toBe('en');
		expect(setupNuxtI18n(context({ requested: 'de' })).locale.value).toBe('en');
	});

	test('does not write the cookie for a locale it only guessed', () => {
		const ctx = context({ requested: 'fr' });
		setupNuxtI18n(ctx);
		expect(ctx.cookie.value).toBeUndefined();
	});
});

describe('setupNuxtI18n in the browser', () => {
	test('hydrates in the locale the server rendered in, whatever the browser asks for', () => {
		const ctx = context({ state: 'fr', cookie: 'en', requested: ['pt-BR'] });
		let asked = false;
		const i18n = setupNuxtI18n({
			...ctx,
			requested: () => {
				asked = true;
				return ['pt-BR'];
			},
		});
		expect(i18n.locale.value).toBe('fr');
		expect(asked).toBe(false);
	});

	test('reads navigator.languages without server rendering', () => {
		expect(
			setupNuxtI18n(context({ requested: ['de', 'fr'] })).locale.value,
		).toBe('fr');
	});

	test('resolves again from a state that is no locale', () => {
		expect(
			setupNuxtI18n(context({ state: 'xx', requested: 'fr' })).locale.value,
		).toBe('fr');
	});
});

describe('setupNuxtI18n resolution, pinned before it is shared', () => {
	test('a state that is a locale wins over the cookie, and is kept as it is', () => {
		const ctx = context({ state: 'pt-BR', cookie: 'fr', requested: 'en' });
		expect(setupNuxtI18n(ctx).locale.value).toBe('pt-BR');
		expect(ctx.state.value).toBe('pt-BR');
		expect(ctx.cookie.value).toBe('fr');
	});

	test('a state that is no locale is replaced by the resolved one', () => {
		const ctx = context({ state: 'xx', cookie: 'pt-BR', requested: 'fr' });
		setupNuxtI18n(ctx);
		expect(ctx.state.value).toBe('pt-BR');
	});

	test('the cookie wins over navigator.languages too', () => {
		expect(
			setupNuxtI18n(context({ cookie: 'fr', requested: ['pt-BR', 'en'] }))
				.locale.value,
		).toBe('fr');
	});

	test('a null cookie and an empty header answer the fallback locale', () => {
		const ctx = context({ cookie: null, requested: '' });
		expect(setupNuxtI18n(ctx).locale.value).toBe('en');
		expect(ctx.state.value).toBe('en');
		expect(ctx.cookie.value).toBeNull();
	});

	test('Accept-Language is read by quality, not by order', () => {
		expect(
			setupNuxtI18n(context({ requested: 'en;q=0.2, fr;q=0.9' })).locale.value,
		).toBe('fr');
	});
});

describe('setLocale', () => {
	test('writes the state and the cookie, so the next page renders in it', () => {
		const ctx = context({ requested: 'en' });
		const i18n = setupNuxtI18n(ctx);
		i18n.setLocale('fr');
		expect(ctx.state.value).toBe('fr');
		expect(ctx.cookie.value).toBe('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
	});
});
