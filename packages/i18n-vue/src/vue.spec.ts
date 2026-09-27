import { describe, expect, test } from 'bun:test';
import { computed, createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { expectThrow } from '../test/expect-throw';
import { createI18n, useI18n } from './vue';

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
		en.b = 'Late';
		fr.b = 'Tard';
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
