import { describe, expect, test } from 'bun:test';
import { expectThrow } from '../../test/expect-throw';
import { createTranslator, lookup } from './translator';

const catalogues = {
	en: {
		common: { greeting: 'Hello {name}' },
		items: '{count, plural, one {# item} other {# items}}',
	},
	fr: {
		common: { greeting: 'Bonjour {name}' },
		items: '{count, plural, one {# article} other {# articles}}',
	},
};

describe('createTranslator', () => {
	test('formats the message in the language the provider answers, at each call', () => {
		let language = 'en';
		const t = createTranslator(catalogues, () => language);
		expect(t('common.greeting', { name: 'Ada' })).toBe('Hello Ada');
		language = 'fr';
		expect(t('items', { count: 2 })).toBe('2 articles');
	});

	test('takes a fixed language, and a language per call, as @nxgt/i18n does', () => {
		const t = createTranslator(catalogues, 'fr');
		expect(t('items', { count: 1 })).toBe('1 article');
		expect(t('items', { count: 1 }, 'en')).toBe('1 item');
		expect(t('items', { count: 1 }, () => 'en')).toBe('1 item');
	});

	test('throws on a key the catalogue does not have — never answers the key', () => {
		const t = createTranslator(catalogues, 'fr');
		expectThrow(
			() => t('common.greting'),
			Error,
			't: fr: common.greting is not a key',
		);
		expectThrow(() => t('common'), Error, 't: fr: common is not a key');
		expectThrow(() => t('toString'), Error, 't: fr: toString is not a key');
	});

	test('throws on a language with no catalogue, without naming it', () => {
		const t = createTranslator(catalogues, () => 'de');
		expectThrow(
			() => t('items', { count: 1 }),
			Error,
			't: the language is not a locale of the catalogues — pick one with pickLocale',
		);
		expect(() =>
			createTranslator(catalogues, () => 'constructor')('items'),
		).toThrow('t: the language is not a locale of the catalogues');
	});

	test('throws on a message that does not format, the formatter error as the cause', () => {
		const t = createTranslator(catalogues, 'en');
		let caught: unknown;
		try {
			t('common.greeting');
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toBe(
			't: en: common.greeting could not be formatted',
		);
		expect((caught as Error).cause).toBeInstanceOf(Error);
	});

	test('refuses a language or a key that is not a string with a TypeError', () => {
		expectThrow(
			() => createTranslator(catalogues, () => 1 as never)('items'),
			TypeError,
			't: the language must be a string — a locale, or a function that answers one',
		);
		expectThrow(
			() => createTranslator(catalogues, 'en')(1 as never),
			TypeError,
			"t: the key must be a string, as t('home.title')",
		);
	});

	test('refuses a wiring mistake with a TypeError', () => {
		expectThrow(
			() => createTranslator(null as never, 'en'),
			TypeError,
			'createTranslator: catalogues must be an object of catalogues by locale, as { en, fr }',
		);
		expectThrow(
			() => createTranslator(catalogues, 1 as never),
			TypeError,
			'createTranslator: getLanguage must be a locale or a function that answers one',
		);
	});
});

describe('lookup', () => {
	test('finds a camelCase catalogue key from a kebab-case call, and back', () => {
		const catalogue = { common: { signIn: 'Sign in' } };
		expect(lookup(catalogue, 'common.sign-in')).toBe('Sign in');
		expect(lookup(catalogue, 'common.signIn')).toBe('Sign in');
	});

	test('finds a kebab-case catalogue key from a camelCase call, and back', () => {
		const catalogue = { common: { 'sign-in': 'Sign in' } };
		expect(lookup(catalogue, 'common.signIn')).toBe('Sign in');
		expect(lookup(catalogue, 'common.sign-in')).toBe('Sign in');
	});

	test('still answers null for a key that is not there, in either convention', () => {
		const catalogue = { common: { signIn: 'Sign in' } };
		expect(lookup(catalogue, 'common.sign-out')).toBeNull();
		expect(lookup(catalogue, 'toString')).toBeNull();
	});
});
