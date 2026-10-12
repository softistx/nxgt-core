import { describe, expect, test } from 'bun:test';
import { computed, createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expectThrow, expectThrowAsync } from '../../test/expect-throw';
import lazyEn from '../../test/lazy-locales/en.json';
import type { Catalogue } from '../core/catalogues';
import type { CatalogueLoader } from '../core/loaders';
import { createI18n, useI18n } from './index';

const catalogues = {
	en: {
		home: {
			title: 'Welcome',
			greeting: 'Hello {name}',
			items: '{count, plural, one {# item} other {# items}}',
			sentOn: 'Sent on {at, date, short}',
			tagged: '<b>{name}</b>',
		},
	},
	fr: {
		home: {
			title: 'Bienvenue',
			greeting: 'Bonjour {name}',
			items: '{count, plural, one {# article} other {# articles}}',
			sentOn: 'Envoyé le {at, date, short}',
			tagged: '<b>{name}</b>',
		},
	},
};

/** A key or arguments the types refuse, to reach the run-time checks. */
const loose = (i18n: ReturnType<typeof createI18n>) =>
	i18n.t as (key: unknown, args?: unknown) => string;

describe('createI18n', () => {
	test('formats in the start locale, the fallback locale by default', () => {
		expect(createI18n({ catalogues }).t('home.title')).toBe('Welcome');
		const i18n = createI18n({ catalogues, locale: 'fr' });
		expect(i18n.t('home.greeting', { name: 'Ada' })).toBe('Bonjour Ada');
		expect(i18n.t('home.items', { count: 2 })).toBe('2 articles');
		expect(i18n.locales).toEqual(['en', 'fr']);
		expect(i18n.fallbackLocale).toBe('en');
	});

	test('switches every t with setLocale, reactively', () => {
		const i18n = createI18n({ catalogues });
		const title = computed(() => i18n.t('home.title'));
		expect(title.value).toBe('Welcome');
		i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(title.value).toBe('Bienvenue');
	});

	test('keeps a tag as text, for Vue to escape', () => {
		expect(
			createI18n({ catalogues }).t('home.tagged', { name: '<i>x</i>' }),
		).toBe('<b><i>x</i></b>');
	});

	test('throws on a key the catalogues do not have — never answers the key', () => {
		const t = loose(createI18n({ catalogues }));
		expectThrow(
			() => t('home.titel'),
			Error,
			't: home.titel is not a key of the catalogues',
		);
		expectThrow(
			() => t('home'),
			Error,
			't: home is not a key of the catalogues',
		);
		expect(() => t('toString')).toThrow('is not a key of the catalogues');
		expectThrow(
			() => t(1),
			TypeError,
			"t: the key must be a string, as t('home.title')",
		);
	});

	test('throws on an argument left out, or one the message does not use', () => {
		const t = loose(createI18n({ catalogues }));
		expectThrow(
			() => t('home.greeting'),
			Error,
			't: home.greeting needs {name}',
		);
		expectThrow(
			() => t('home.title', { name: 'Ada' }),
			Error,
			't: home.title does not use {name}',
		);
	});

	test('refuses arguments of the wrong type with a TypeError naming no value', () => {
		const t = loose(createI18n({ catalogues }));
		expectThrow(
			() => t('home.greeting', 'Ada'),
			TypeError,
			"t: home.greeting takes its arguments as an object, as { name: 'Ada' }",
		);
		expectThrow(
			() => t('home.items', { count: '2' }),
			TypeError,
			't: home.items is given {count} as a string — the message uses it as a number',
		);
		expectThrow(
			() => t('home.sentOn', { at: 'today' }),
			TypeError,
			't: home.sentOn is given {at} as a string — the message uses it as a date',
		);
		expectThrow(
			() => t('home.greeting', { name: null }),
			TypeError,
			't: home.greeting is given {name} as a null — the message uses it as a string',
		);
	});

	test('answers whether a key is a message, for a key computed at run time', () => {
		const i18n = createI18n({ catalogues });
		expect(i18n.has('home.title')).toBe(true);
		expect(i18n.has('home')).toBe(false);
		expect(i18n.has('constructor')).toBe(false);
	});

	test('t and has accept kebab-case for a key the catalogue wrote camelCase', () => {
		const i18n = createI18n({ catalogues });
		expect(i18n.has('home.sent-on')).toBe(true);
		expect(loose(i18n)('home.sent-on', { at: new Date(0) })).toBe(
			i18n.t('home.sentOn', { at: new Date(0) }),
		);
	});

	test('throws on a locale the catalogues do not have, without naming it', () => {
		const i18n = createI18n({ catalogues });
		expectThrow(
			() => i18n.setLocale('de'),
			Error,
			'setLocale: the locale is not a locale of the catalogues — pick one with pickLocale',
		);
		expectThrow(
			() => i18n.setLocale(1 as never),
			TypeError,
			'setLocale: the locale must be a string, as fr',
		);
		expect(i18n.locale.value).toBe('en');
	});

	test('checks the catalogues, naming the locale and the key', () => {
		expectThrow(
			() =>
				createI18n({
					catalogues: { en: { a: 'Hi {name}' }, fr: { b: 'Salut' } },
				}),
			Error,
			'i18n: fr: a is missing — en, the fallback locale, has it',
		);
		expect(() =>
			createI18n({
				catalogues: { en: { a: 'Hi' }, fr: { a: 'Salut' } },
				fallbackLocale: 'fr',
			}),
		).not.toThrow();
	});

	test('checks a set of catalogues once, even wrapped anew for each request', () => {
		const en: Record<string, string> = { a: 'Hi {name}' };
		const fr: Record<string, string> = { a: 'Salut {name}' };
		const first = createI18n({ catalogues: { en, fr } });
		// Seen only if the catalogues were checked again: the cache hides it.
		en['b'] = 'Late';
		fr['b'] = 'Tard';
		const second = createI18n({ catalogues: { en, fr }, locale: 'fr' });
		expect(second.has('b')).toBe(false);
		expect(second.t('a', { name: 'Ada' })).toBe('Salut Ada');
		expect(first.locale.value).toBe('en');
		// Another object, or another fallback locale, is another set: checked.
		expect(createI18n({ catalogues: { en: { ...en }, fr } }).has('b')).toBe(
			true,
		);
		expect(
			createI18n({ catalogues: { en, fr }, fallbackLocale: 'fr' }).has('b'),
		).toBe(true);
	});

	test('refuses a wiring mistake with a TypeError', () => {
		const fails = (options: unknown, message: string) =>
			expectThrow(() => createI18n(options as never), TypeError, message);
		fails(
			null,
			'createI18n: options must be an object, as { catalogues: { en, fr } }',
		);
		fails(
			{ catalogues: { en: 'Hello' } },
			'createI18n: catalogues must be an object of catalogues by locale, as { en, fr }',
		);
		fails(
			{ catalogues: {} },
			'createI18n: catalogues must hold at least one locale, as { en, fr }',
		);
		fails(
			{ catalogues: { English: {} } },
			'createI18n: catalogues holds something that is not a locale — key each catalogue by a BCP 47 tag, as en or pt-BR',
		);
		fails(
			{ catalogues, fallbackLocale: 'de' },
			'createI18n: fallbackLocale must be a locale of the catalogues',
		);
		fails(
			{ catalogues, locale: 'de' },
			'createI18n: locale must be a locale of the catalogues — pick one with pickLocale',
		);
	});
});

describe('catalogues given up front, with no loaders', () => {
	test('lists the locales in the order of the catalogues, the first the fallback', () => {
		const i18n = createI18n({
			catalogues: { fr: catalogues.fr, en: catalogues.en },
		});
		expect(i18n.locales).toEqual(['fr', 'en']);
		expect(i18n.fallbackLocale).toBe('fr');
		expect(i18n.locale.value).toBe('fr');
	});

	test('setLocale switches before the next line runs, with nothing to await', async () => {
		const i18n = createI18n({ catalogues });
		i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
		const app = createSSRApp({
			render() {
				return h('p', this.t('home.title'));
			},
		}).use(i18n);
		i18n.setLocale('en');
		expect(await renderToString(app)).toBe('<p>Welcome</p>');
	});

	test('setLocale throws on bad input, rather than answering a rejection', () => {
		const i18n = createI18n({ catalogues });
		let threw = false;
		try {
			i18n.setLocale('de');
		} catch {
			threw = true;
		}
		expect(threw).toBe(true);
		expect(i18n.locale.value).toBe('en');
	});

	test('a loaders key left undefined is no loaders at all', () => {
		const i18n = createI18n({
			catalogues,
			loaders: undefined,
		} as never);
		expect(i18n.locales).toEqual(['en', 'fr']);
	});
});

/** A promise settled from outside, to hold a loader mid-flight. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((ok, ko) => {
		resolve = ok;
		reject = ko;
	});
	return { promise, resolve, reject };
}

/** A loader that counts its calls and answers `answer()` each time. */
function counted(answer: () => Promise<unknown>) {
	const loader = Object.assign(
		() => {
			loader.calls += 1;
			return answer();
		},
		{ calls: 0 },
	);
	return loader as typeof loader & CatalogueLoader;
}

/** A copy of `fr`, so a spec's catalogue object is its own and the check cache never hides it. */
const freshFr = (): Catalogue => structuredClone(catalogues.fr);

describe('catalogues loaded on demand', () => {
	const en = catalogues.en;

	test('keeps locale and t on the previous locale until the catalogue is loaded and checked', async () => {
		const fr = deferred<Catalogue>();
		const i18n = createI18n({
			catalogues: { en },
			loaders: { fr: () => fr.promise },
		});
		const title = computed(() => i18n.t('home.title'));
		const done = i18n.setLocale('fr');
		expect(done).toBeInstanceOf(Promise);
		expect(i18n.locale.value).toBe('en');
		expect(title.value).toBe('Welcome');
		fr.resolve(freshFr());
		await done;
		expect(i18n.locale.value).toBe('fr');
		expect(title.value).toBe('Bienvenue');
		expect(i18n.t('home.items', { count: 2 })).toBe('2 articles');
	});

	test('a locale already loaded switches synchronously, and answers a resolved promise', async () => {
		const i18n = createI18n({
			catalogues: { en },
			loaders: { fr: async () => freshFr() },
		});
		await i18n.setLocale('fr');
		const back = i18n.setLocale('en');
		expect(i18n.locale.value).toBe('en');
		expect(back).toBeInstanceOf(Promise);
		expect(await back).toBeUndefined();
		i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
	});

	test('a locale of the catalogues still switches synchronously, and answers a resolved promise', async () => {
		const i18n = createI18n({ catalogues });
		const done = i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(done).toBeInstanceOf(Promise);
		expect(await done).toBeUndefined();
	});

	test('calls a loader once, concurrent calls included', async () => {
		const fr = counted(async () => freshFr());
		const i18n = createI18n({ catalogues: { en }, loaders: { fr } });
		await Promise.all([i18n.setLocale('fr'), i18n.setLocale('fr')]);
		expect(fr.calls).toBe(1);
		i18n.setLocale('en');
		await i18n.setLocale('fr');
		expect(fr.calls).toBe(1);
		expect(i18n.locale.value).toBe('fr');
	});

	test('the last call wins, whichever load ends first', async () => {
		const fr = deferred<Catalogue>();
		const de = deferred<Catalogue>();
		const i18n = createI18n({
			catalogues: { en },
			loaders: { fr: () => fr.promise, de: () => de.promise },
		});
		const toFr = i18n.setLocale('fr');
		const toDe = i18n.setLocale('de');
		de.resolve(freshFr());
		await toDe;
		expect(i18n.locale.value).toBe('de');
		fr.resolve(freshFr());
		await toFr;
		expect(i18n.locale.value).toBe('de');
	});

	test('a switch to a loaded locale wins over a load still pending', async () => {
		const fr = deferred<Catalogue>();
		const loader = counted(() => fr.promise);
		const i18n = createI18n({ catalogues: { en }, loaders: { fr: loader } });
		const toFr = i18n.setLocale('fr');
		i18n.setLocale('en');
		fr.resolve(freshFr());
		await toFr;
		expect(i18n.locale.value).toBe('en');
		// Loaded all the same: the next switch is synchronous, the loader not called again.
		i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(loader.calls).toBe(1);
	});

	test('a loader that rejects: the cause kept, the locale unchanged, and the next call retries', async () => {
		const offline = new Error('offline');
		let fail = true;
		const fr = counted(async () => {
			if (fail) throw offline;
			return freshFr();
		});
		const i18n = createI18n({ catalogues: { en }, loaders: { fr } });
		const error = await expectThrowAsync(
			() => i18n.setLocale('fr'),
			Error,
			'setLocale: the catalogue of fr could not be loaded',
		);
		expect(error.cause).toBe(offline);
		expect(i18n.locale.value).toBe('en');
		fail = false;
		await i18n.setLocale('fr');
		expect(fr.calls).toBe(2);
		expect(i18n.locale.value).toBe('fr');
	});

	test('a loader that throws before answering a promise is a load that failed', async () => {
		const i18n = createI18n({
			catalogues: { en },
			loaders: {
				fr: () => {
					throw new Error('no such chunk');
				},
			},
		});
		await expectThrowAsync(
			() => i18n.setLocale('fr'),
			Error,
			'setLocale: the catalogue of fr could not be loaded',
		);
	});

	test('a catalogue that cannot be right is refused with the check’s own message, and not kept', async () => {
		const fr = counted(async () => ({ home: { title: 'Bienvenue' } }));
		const i18n = createI18n({ catalogues: { en }, loaders: { fr } });
		await expectThrowAsync(
			() => i18n.setLocale('fr'),
			Error,
			'i18n: fr: home.greeting is missing — en, the fallback locale, has it',
		);
		expect(i18n.locale.value).toBe('en');
		await expectThrowAsync(
			() => i18n.setLocale('fr'),
			Error,
			'i18n: fr: home.greeting is missing — en, the fallback locale, has it',
		);
		expect(fr.calls).toBe(2);
	});

	test('takes a module whose default export is the catalogue, or the catalogue itself', async () => {
		const enOnly = { home: { title: 'Welcome', greeting: 'Hello {name}' } };
		const fromModule = createI18n({
			catalogues: { en: enOnly },
			loaders: { fr: () => import('../../test/lazy-locales/fr.json') },
		});
		await fromModule.setLocale('fr');
		expect(fromModule.t('home.greeting', { name: 'Ada' })).toBe('Bonjour Ada');
		const plain = createI18n({
			catalogues: { en },
			loaders: { fr: async () => freshFr() },
		});
		await plain.setLocale('fr');
		expect(plain.t('home.title')).toBe('Bienvenue');
	});

	test('unwraps a module only: a plain object with a default key is a catalogue', async () => {
		const i18n = createI18n({
			catalogues: { en },
			loaders: { fr: async () => ({ default: freshFr() }) },
		});
		await expectThrowAsync(
			() => i18n.setLocale('fr'),
			Error,
			'i18n: fr: home.greeting is missing — en, the fallback locale, has it',
		);
	});

	test('refuses an answer that is not a catalogue, with a TypeError', async () => {
		const message =
			'setLocale: the loader of fr must answer a catalogue, or a module whose default export is one';
		for (const answer of [
			() => Promise.resolve('fr'),
			() => Promise.resolve(null),
			() => Promise.resolve([]),
			// A module with no default export.
			() => import('../../test/expect-throw'),
		]) {
			const i18n = createI18n({
				catalogues: { en },
				loaders: { fr: answer as never },
			});
			await expectThrowAsync(() => i18n.setLocale('fr'), TypeError, message);
			expect(i18n.locale.value).toBe('en');
		}
	});

	test('lists the catalogues’ locales, then those only loaded on demand', () => {
		const loader = async () => freshFr();
		expect(
			createI18n({ catalogues: { en }, loaders: { de: loader, fr: loader } })
				.locales,
		).toEqual(['en', 'de', 'fr']);
		expect(
			createI18n({ catalogues, loaders: { de: loader, fr: loader } }).locales,
		).toEqual(['en', 'fr', 'de']);
	});

	test('a locale in both is already loaded: its loader is never called', async () => {
		const fr = counted(async () => ({}));
		const i18n = createI18n({ catalogues, loaders: { fr } });
		i18n.setLocale('fr');
		expect(i18n.locale.value).toBe('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
		expect(fr.calls).toBe(0);
		expect(
			createI18n({ catalogues, loaders: { fr }, locale: 'fr' }).t('home.title'),
		).toBe('Bienvenue');
	});

	test('checks a catalogue object once across instances, and a new object again', async () => {
		const fr = freshFr();
		const first = createI18n({
			catalogues: { en },
			loaders: { fr: async () => fr },
		});
		await first.setLocale('fr');
		// Seen only if the same object were checked again: the cache hides it.
		(fr as Record<string, unknown>)['late'] = 'Tard';
		const second = createI18n({
			catalogues: { en },
			loaders: { fr: async () => fr },
		});
		await second.setLocale('fr');
		expect(second.t('home.title')).toBe('Bienvenue');
		const third = createI18n({
			catalogues: { en },
			loaders: { fr: async () => ({ ...fr }) },
		});
		await expectThrowAsync(
			() => third.setLocale('fr'),
			Error,
			'i18n: fr: late is not a key of en, the fallback locale',
		);
	});

	test('formats each loaded catalogue with its own messages', async () => {
		const salut = freshFr() as { home: Record<string, string> };
		salut.home['title'] = 'Salut';
		const one = createI18n({
			catalogues: { en },
			loaders: { fr: async () => freshFr() },
		});
		const two = createI18n({
			catalogues: { en },
			loaders: { fr: async () => salut },
		});
		await one.setLocale('fr');
		await two.setLocale('fr');
		expect(one.t('home.title')).toBe('Bienvenue');
		expect(two.t('home.title')).toBe('Salut');
	});

	test('refuses a wiring mistake in loaders with a TypeError', () => {
		const fails = (options: unknown, message: string) =>
			expectThrow(() => createI18n(options as never), TypeError, message);
		const loader = async () => freshFr();
		const shape =
			"createI18n: loaders must be an object of functions by locale, as { fr: () => import('./locales/fr.json') }";
		fails({ catalogues: { en }, loaders: 'fr' }, shape);
		fails({ catalogues: { en }, loaders: null }, shape);
		fails({ catalogues: { en }, loaders: [loader] }, shape);
		fails({ catalogues: { en }, loaders: { fr: './locales/fr.json' } }, shape);
		fails(
			{ catalogues: { en }, loaders: { French: loader } },
			'createI18n: loaders holds something that is not a locale — key each loader by a BCP 47 tag, as fr or pt-BR',
		);
		fails(
			{ catalogues: { en }, loaders: { fr: loader }, fallbackLocale: 'fr' },
			'createI18n: fallbackLocale must be a locale of the catalogues, not one loaded on demand — the reference is checked when createI18n runs',
		);
		fails(
			{ catalogues: { en }, loaders: { fr: loader }, locale: 'fr' },
			'createI18n: locale must be a locale of the catalogues, not one loaded on demand — start in a loaded locale, then await setLocale(locale)',
		);
		// A locale in neither keeps the message it always had.
		fails(
			{ catalogues: { en }, loaders: { fr: loader }, locale: 'de' },
			'createI18n: locale must be a locale of the catalogues — pick one with pickLocale',
		);
		fails(
			{ catalogues: { en }, loaders: { fr: loader }, fallbackLocale: 'de' },
			'createI18n: fallbackLocale must be a locale of the catalogues',
		);
	});

	test('setLocale still throws on bad input synchronously, before any loader', () => {
		const fr = counted(async () => freshFr());
		const i18n = createI18n({ catalogues: { en }, loaders: { fr } });
		expectThrow(
			() => i18n.setLocale(1 as never),
			TypeError,
			'setLocale: the locale must be a string, as fr',
		);
		expectThrow(
			() => i18n.setLocale('de'),
			Error,
			'setLocale: the locale is not a locale of the catalogues — pick one with pickLocale',
		);
		expect(fr.calls).toBe(0);
	});
});

describe('on a plain Bun server, with no Vite and no Nuxt', () => {
	// What a backend writes by hand: a static import for the fallback locale, a
	// dynamic import per other locale. No plugin produced this record.
	const loaders = { fr: () => import('../../test/lazy-locales/fr.json') };

	const render = async (locale: string) => {
		const i18n = createI18n({ catalogues: { en: lazyEn }, loaders });
		await i18n.setLocale(locale);
		const app = createSSRApp({
			render() {
				return h('p', this.t('home.greeting', { name: 'Ada' }));
			},
		}).use(i18n);
		return renderToString(app);
	};

	test('renders each request in its locale once setLocale is awaited', async () => {
		const [fr, en] = await Promise.all([render('fr'), render('en')]);
		expect(fr).toBe('<p>Bonjour Ada</p>');
		expect(en).toBe('<p>Hello Ada</p>');
	});

	test('translates with t alone, with no app at all', async () => {
		const i18n = createI18n({ catalogues: { en: lazyEn }, loaders });
		await i18n.setLocale('fr');
		expect(i18n.t('home.title')).toBe('Bienvenue');
	});
});

describe('the Vue plugin', () => {
	test('adds t to every template, in the current locale', async () => {
		const i18n = createI18n({ catalogues, locale: 'fr' });
		const app = createSSRApp({
			render() {
				return h('p', this.t('home.greeting', { name: 'Ada' }));
			},
		}).use(i18n);
		expect(await renderToString(app)).toBe('<p>Bonjour Ada</p>');
	});

	test('escapes a message like any text', async () => {
		const i18n = createI18n({ catalogues });
		const app = createSSRApp({
			render() {
				return h('p', this.t('home.tagged', { name: '<script>' }));
			},
		}).use(i18n);
		expect(await renderToString(app)).toBe(
			'<p>&lt;b&gt;&lt;script&gt;&lt;/b&gt;</p>',
		);
	});

	test('answers the installed i18n from useI18n', async () => {
		const i18n = createI18n({ catalogues });
		let used: unknown;
		const Child = defineComponent({
			setup() {
				used = useI18n();
				const { t } = useI18n();
				return () => h('span', t('home.title'));
			},
		});
		const app = createSSRApp({ render: () => h(Child) }).use(i18n);
		expect(await renderToString(app)).toBe('<span>Welcome</span>');
		expect(used).toBe(i18n);
	});

	test('throws from useI18n when none is installed', async () => {
		const Child = defineComponent({
			setup() {
				useI18n();
				return () => null;
			},
		});
		const app = createSSRApp({ render: () => h(Child) });
		app.config.warnHandler = () => {};
		await expect(renderToString(app)).rejects.toThrow(
			'useI18n: no i18n is installed — app.use(createI18n({ catalogues })) first, in a component or where inject works',
		);
	});
});
