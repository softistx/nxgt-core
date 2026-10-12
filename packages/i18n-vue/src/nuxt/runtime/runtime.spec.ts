import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { reactive, ref, toRaw } from 'vue';
import type { Catalogue } from '../../core/catalogues';
import type { CatalogueLoaders } from '../../core/loaders';
import { CATALOGUE_STATE_KEY, setupLazyNuxtI18n, setupNuxtI18n } from './index';

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

const de = { home: { title: 'Willkommen' } };

/** The lazy plugin's composables: `de` loaded on demand, its calls counted. */
function lazyContext(options: {
	cookie?: string | null;
	state?: string;
	catalogue?: Catalogue | null;
	requested?: string | readonly string[] | null;
	loader?: () => Promise<unknown>;
}) {
	const calls = { de: 0 };
	const loader = options.loader ?? (async () => de);
	const loaders = {
		de: () => {
			calls.de++;
			return loader();
		},
	} as CatalogueLoaders;
	return {
		calls,
		catalogues: { en: catalogues.en, fr: catalogues.fr },
		loaders,
		locales: ['en', 'fr', 'de'],
		fallbackLocale: 'en',
		cookie: ref<string | null | undefined>(options.cookie),
		state: ref<string | undefined>(options.state),
		catalogue: ref<Catalogue | null | undefined>(options.catalogue),
		requested: () => options.requested,
	};
}

describe('setupLazyNuxtI18n', () => {
	test('has a payload key of its own', () => {
		expect(CATALOGUE_STATE_KEY).toBe('@nxgt/i18n-vue:catalogue');
	});

	test('on the server, prefers the cookie, awaits the loader, renders in it and writes the catalogue state', async () => {
		const ctx = lazyContext({ cookie: 'de', requested: 'fr' });
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(ctx.calls.de).toBe(1);
		expect(i18n.locale.value).toBe('de');
		expect(i18n.t('home.title')).toBe('Willkommen');
		expect(ctx.state.value).toBe('de');
		expect(toRaw(ctx.catalogue.value)).toBe(de);
	});

	test('puts the default export of a module namespace in the catalogue state, not the module', async () => {
		const module = { [Symbol.toStringTag]: 'Module', default: de };
		const ctx = lazyContext({ cookie: 'de', loader: async () => module });
		await setupLazyNuxtI18n(ctx);
		expect(toRaw(ctx.catalogue.value)).toBe(de);
	});

	test('a resolved fallback calls no loader, and the catalogue state is null', async () => {
		const ctx = lazyContext({ requested: 'en' });
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(i18n.locale.value).toBe('en');
		expect(ctx.calls.de).toBe(0);
		expect(ctx.catalogue.value).toBeNull();
	});

	test('a resolved locale of the catalogues calls no loader either', async () => {
		const ctx = lazyContext({ requested: 'fr' });
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(i18n.t('home.title')).toBe('Bienvenue');
		expect(ctx.calls.de).toBe(0);
		expect(ctx.catalogue.value).toBeNull();
	});

	test('hydrates from the state and the catalogue state without calling the loader', async () => {
		const payload = { home: { title: 'Willkommen (payload)' } };
		const ctx = lazyContext({
			state: 'de',
			catalogue: payload,
			requested: ['fr'],
		});
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(ctx.calls.de).toBe(0);
		expect(i18n.locale.value).toBe('de');
		expect(i18n.t('home.title')).toBe('Willkommen (payload)');
		expect(toRaw(ctx.catalogue.value)).toBe(payload);
	});

	test('ignores a catalogue state when the state is no locale, and loads', async () => {
		const ctx = lazyContext({
			state: 'xx',
			catalogue: { home: { title: 'stale' } },
			requested: 'de',
		});
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(ctx.calls.de).toBe(1);
		expect(i18n.t('home.title')).toBe('Willkommen');
	});

	test('without server rendering (no state), calls the loader once', async () => {
		const ctx = lazyContext({ requested: ['de', 'fr'] });
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(ctx.calls.de).toBe(1);
		expect(i18n.locale.value).toBe('de');
	});

	test('does not write the cookie for a locale it only guessed', async () => {
		const ctx = lazyContext({ requested: 'de' });
		await setupLazyNuxtI18n(ctx);
		expect(ctx.cookie.value).toBeUndefined();
		expect(toRaw(ctx.catalogue.value)).toBe(de);
	});

	test('await setLocale writes the state, the cookie and the catalogue state', async () => {
		const ctx = lazyContext({ requested: 'en' });
		const i18n = await setupLazyNuxtI18n(ctx);
		await i18n.setLocale('de');
		expect(ctx.state.value).toBe('de');
		expect(ctx.cookie.value).toBe('de');
		expect(toRaw(ctx.catalogue.value)).toBe(de);
		expect(i18n.t('home.title')).toBe('Willkommen');
		await i18n.setLocale('fr');
		expect(ctx.state.value).toBe('fr');
		expect(ctx.cookie.value).toBe('fr');
		expect(ctx.catalogue.value).toBeNull();
	});

	test('a wrong loaders is refused by createI18n, with its own TypeError', async () => {
		const ctx = {
			...lazyContext({ cookie: 'de' }),
			loaders: { de: 'fr.json' },
		};
		await expect(
			setupLazyNuxtI18n(
				ctx as unknown as Parameters<typeof setupLazyNuxtI18n>[0],
			),
		).rejects.toThrow(
			"createI18n: loaders must be an object of functions by locale, as { fr: () => import('./locales/fr.json') }",
		);
	});

	test('loaders that is no object is refused by createI18n, not as stray locales', async () => {
		const ctx = { ...lazyContext({ cookie: 'de' }), loaders: 'fr.json' };
		await expect(
			setupLazyNuxtI18n(
				ctx as unknown as Parameters<typeof setupLazyNuxtI18n>[0],
			),
		).rejects.toThrow(
			"createI18n: loaders must be an object of functions by locale, as { fr: () => import('./locales/fr.json') }",
		);
	});

	test('refuses a locale in neither catalogues nor loaders, before resolving', async () => {
		const ctx = {
			...lazyContext({ cookie: 'it' }),
			locales: ['en', 'fr', 'de', 'it'],
		};
		await expect(setupLazyNuxtI18n(ctx)).rejects.toThrow(
			new TypeError(
				'setupLazyNuxtI18n: locales holds it, which is neither in catalogues nor in loaders — give each locale a catalogue or a loader',
			),
		);
		await setupLazyNuxtI18n(ctx).catch((error: unknown) => {
			expect((error as Error).constructor).toBe(TypeError);
		});
		expect(ctx.state.value).toBeUndefined();
		expect(ctx.calls.de).toBe(0);
	});

	test('a payload catalogue that fails its check rejects the setup, without calling the loader', async () => {
		const ctx = lazyContext({
			state: 'de',
			catalogue: { home: { title: 'Willkommen', extra: 'Mehr' } },
		});
		await expect(setupLazyNuxtI18n(ctx)).rejects.toThrow(
			'i18n: de: home.extra is not a key of en, the fallback locale',
		);
		expect(ctx.calls.de).toBe(0);
	});

	test('a reactive payload reaches the check as the raw object', async () => {
		// A getter sees the proxy as `this` when read through it.
		const readers: unknown[] = [];
		const raw = {
			get home() {
				readers.push(this);
				return { title: 'Willkommen (payload)' };
			},
		};
		const ctx = lazyContext({ state: 'de' });
		ctx.catalogue.value = reactive(raw) as Catalogue;
		const i18n = await setupLazyNuxtI18n(ctx);
		expect(i18n.t('home.title')).toBe('Willkommen (payload)');
		expect(readers.length).toBeGreaterThan(0);
		expect(readers.every((reader) => reader === raw)).toBe(true);
		expect(ctx.calls.de).toBe(0);
	});

	test('a loader that rejects rejects the setup', async () => {
		const ctx = lazyContext({
			cookie: 'de',
			loader: () => Promise.reject(new Error('offline')),
		});
		await expect(setupLazyNuxtI18n(ctx)).rejects.toThrow(
			'setLocale: the catalogue of de could not be loaded',
		);
	});

	test('after a rejection, setting up again without the loader renders in the fallback locale', async () => {
		// The recovery docs/troubleshooting.md shows.
		const context = lazyContext({
			cookie: 'de',
			loader: () => Promise.reject(new Error('offline')),
		});
		const i18n = await setupLazyNuxtI18n(context).catch(() =>
			setupLazyNuxtI18n({
				...context,
				locales: Object.keys(context.catalogues),
				loaders: {},
			}),
		);
		expect(i18n.locale.value).toBe('en');
		expect(context.state.value).toBe('en');
		expect(context.cookie.value).toBe('de');
		expect(context.catalogue.value).toBeNull();
	});

	test('keeps nothing per request: catalogues a loader answers fresh each time are collected', () => {
		// A server sets up an i18n per request, and a loader that fetches answers
		// a new object each time: none may outlive its request, as one fed back
		// into createI18n's catalogues would. In a process of its own, so what
		// other spec files leave behind does not skew the collector.
		const run = Bun.spawnSync([
			process.execPath,
			join(import.meta.dir, '../../../test/lazy-nuxt-requests.ts'),
			'1000',
		]);
		if (run.exitCode !== 0) console.error(run.stderr.toString());
		expect(run.exitCode).toBe(0);
		const { requests, alive } = JSON.parse(run.stdout.toString());
		expect(requests).toBe(1000);
		// Conservative stack scanning pins a few, however many requests ran —
		// measured from 0 to 3 of 1000 over twelve runs, and up to 22 of 200 —
		// while a leak grows with them: a cache would pin all 1000.
		expect(alive).toBeLessThan(50);
	});
});
