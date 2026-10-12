import { describe, expect, test } from 'bun:test';
import { expectThrow } from '../../test/expect-throw';
import {
	type Catalogues,
	checkCatalogues,
	checkLocale,
	type Messages,
} from './catalogues';

const check = (catalogues: Catalogues, locales = ['en', 'fr']) =>
	checkCatalogues(catalogues, locales, 'en');

const fails = (catalogues: unknown, message: string, locales?: string[]) =>
	expectThrow(() => check(catalogues as Catalogues, locales), Error, message);

describe('checkCatalogues', () => {
	test('answers every message by dotted key, with the kind of each argument', () => {
		const messages = check(
			{
				en: {
					a: {
						b: 'Hi {name}, {count, plural, one {# day} other {# days}} {at, date}',
					},
					c: '{gender, select, other {x}} {total, number}',
				},
			},
			['en'],
		).get('en');
		expect([...(messages?.keys() ?? [])]).toEqual(['a.b', 'c']);
		expect(Object.fromEntries(messages?.get('a.b')?.args ?? [])).toEqual({
			name: 'string',
			count: 'number',
			at: 'date',
		});
		expect(Object.fromEntries(messages?.get('c')?.args ?? [])).toEqual({
			gender: 'string',
			total: 'number',
		});
	});

	test('a plain {n} beside a typed use takes the type; a translation may leave an argument out', () => {
		const messages = check({
			en: { a: '{n} of {n, number}', b: 'Hello {name}' },
			fr: { a: '{n, number}', b: 'Bonjour' },
		});
		expect(messages.get('en')?.get('a')?.args.get('n')).toBe('number');
		expect(messages.get('fr')?.get('b')?.args.size).toBe(0);
	});

	test('a tag is text, and its arguments count', () => {
		const messages = check({ en: { a: '<b>{name}</b>' } }, ['en']);
		expect(messages.get('en')?.get('a')?.args.get('name')).toBe('string');
	});

	test('refuses a catalogue that is not objects of messages', () => {
		fails({ en: [] }, 'i18n: en: the catalogue must be an object of messages', [
			'en',
		]);
		fails({}, 'i18n: en: the catalogue must be an object of messages', ['en']);
		fails(
			{ en: { a: 1 } },
			'i18n: en: a must be a message (a string) or an object of messages',
			['en'],
		);
		fails(
			{ en: { a: { b: null } } },
			'i18n: en: a.b must be a message (a string) or an object of messages',
			['en'],
		);
	});

	test('accepts a key segment in camelCase or kebab-case, the same message either way', () => {
		const messages = check(
			{ en: { 'verify-email': { title: 'x' }, verifyEmail: 'y' } },
			['en'],
		);
		expect([...(messages.get('en')?.keys() ?? [])]).toEqual([
			'verify-email.title',
			'verifyEmail',
		]);
	});

	test('refuses a key that is not camelCase or kebab-case, or dotted', () => {
		fails(
			{ en: { verify_email: { title: 'x' } } },
			'i18n: en: verify_email is not camelCase or kebab-case — every segment of a key is one or the other, and nested rather than dotted, as verifyEmail.title or verify-email.title',
			['en'],
		);
		fails(
			{ en: { 'verifyEmail.title': 'x' } },
			'i18n: en: verifyEmail.title is not camelCase or kebab-case — every segment of a key is one or the other, and nested rather than dotted, as verifyEmail.title or verify-email.title',
			['en'],
		);
	});

	test('refuses two keys that are the same key in two conventions', () => {
		fails(
			{ en: { signIn: 'a', 'sign-in': 'b' } },
			'i18n: en: sign-in and signIn are the same key in two conventions — keep only one',
			['en'],
		);
	});

	test('accepts two keys that merely fold to the same string once hyphens are stripped', () => {
		// `coop` and `co-op` are two different words, not one key in two
		// conventions — a lossy fold must not treat them as a collision.
		const messages = check({ en: { coop: 'a', 'co-op': 'b' } }, ['en']);
		expect([...(messages.get('en')?.keys() ?? [])].sort()).toEqual([
			'co-op',
			'coop',
		]);
	});

	test('refuses a message that does not parse, without its text', () => {
		expect(() => check({ en: { a: 'Hello {name' } }, ['en'])).toThrow(
			/^i18n: en: a is not a valid ICU message \(/,
		);
	});

	test('refuses an argument that is not camelCase, or used as two kinds', () => {
		fails(
			{ en: { a: '{first_name}' } },
			'i18n: en: a uses {first_name}, which is not camelCase — an argument is a camelCase name, as {firstName}',
			['en'],
		);
		fails(
			{ en: { a: '{n, number} {n, date}' } },
			'i18n: en: a uses {n} as number and as date',
			['en'],
		);
	});

	test('refuses a locale whose keys differ from the fallback locale', () => {
		fails(
			{ en: { a: 'x', b: 'y' }, fr: { a: 'x' } },
			'i18n: fr: b is missing — en, the fallback locale, has it',
		);
		fails(
			{ en: { a: 'x' }, fr: { a: 'x', extra: 'y' } },
			'i18n: fr: extra is not a key of en, the fallback locale',
		);
	});

	test('refuses an argument a translation invents, or types differently', () => {
		fails(
			{ en: { a: 'Hello' }, fr: { a: 'Bonjour {name}' } },
			'i18n: fr: a uses {name}, which en does not declare',
		);
		fails(
			{ en: { a: '{n, number}' }, fr: { a: '{n, date}' } },
			'i18n: fr: a uses {n} as date, and en declares it as number',
		);
	});

	test('reads every locale before comparing any: a message that does not parse wins over a missing key', () => {
		expect(() =>
			checkCatalogues(
				{ en: { a: 'x', b: 'y' }, fr: { a: 'x' }, de: { a: '{n', b: 'y' } },
				['en', 'fr', 'de'],
				'en',
			),
		).toThrow(/^i18n: de: a is not a valid ICU message \(/);
	});

	test('checks the fallback locale first wherever it sits in locales', () => {
		fails(
			{ fr: { a: 'x' }, en: { a: 'x', b: 'y' } },
			'i18n: fr: b is missing — en, the fallback locale, has it',
			['fr', 'en'],
		);
	});
});

describe('checkLocale', () => {
	const reference = check({ en: { a: 'Hi {name}', b: 'Bye' } }, ['en']).get(
		'en',
	) as Messages;

	test('answers one locale’s messages, compared with the reference', () => {
		const messages = checkLocale(
			{ a: 'Salut {name}', b: 'Au revoir' },
			'fr',
			'en',
			reference,
		);
		expect([...messages.keys()]).toEqual(['a', 'b']);
		expect(messages.get('a')?.args.get('name')).toBe('string');
	});

	test('refuses with the messages checkCatalogues gives', () => {
		expectThrow(
			() => checkLocale({ a: 'Salut {name}' }, 'fr', 'en', reference),
			Error,
			'i18n: fr: b is missing — en, the fallback locale, has it',
		);
		expectThrow(
			() => checkLocale('Salut', 'fr', 'en', reference),
			Error,
			'i18n: fr: the catalogue must be an object of messages',
		);
		expectThrow(
			() => checkLocale({ a: 'Salut {nom}', b: 'x' }, 'fr', 'en', reference),
			Error,
			'i18n: fr: a uses {nom}, which en does not declare',
		);
	});

	test('the fallback locale is read, never compared with itself', () => {
		expect(checkLocale({ only: 'x' }, 'en', 'en', reference).has('only')).toBe(
			true,
		);
	});
});
