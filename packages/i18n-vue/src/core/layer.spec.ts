import { describe, expect, test } from 'bun:test';
import { type Catalogues, checkCatalogues } from './catalogues';
import { layerCatalogues } from './layer';

describe('layerCatalogues', () => {
	const ui: Catalogues = {
		en: { common: { greeting: 'Hello {name},', footer: { why: 'Why' } } },
		fr: {
			common: { greeting: 'Bonjour {name},', footer: { why: 'Pourquoi' } },
		},
		de: { common: { greeting: 'Hallo {name},' } },
	};

	test("merges each source under the project's catalogue, key by key", () => {
		expect(
			layerCatalogues([ui], {
				en: {
					common: { greeting: 'Hi {name},' },
					welcome: { title: 'Welcome' },
				},
				fr: { welcome: { title: 'Bienvenue' } },
			}),
		).toEqual({
			en: {
				common: { greeting: 'Hi {name},', footer: { why: 'Why' } },
				welcome: { title: 'Welcome' },
			},
			fr: {
				common: { greeting: 'Bonjour {name},', footer: { why: 'Pourquoi' } },
				welcome: { title: 'Bienvenue' },
			},
		});
	});

	test('layers the sources in order, the later over the earlier', () => {
		expect(
			layerCatalogues([ui, { en: { common: { greeting: 'Hey {name},' } } }], {
				en: {},
			})['en'],
		).toEqual({ common: { greeting: 'Hey {name},', footer: { why: 'Why' } } });
	});

	test('a message replaces a group, and a group a message', () => {
		expect(
			layerCatalogues([{ en: { a: 'A', b: { c: 'C' } } }], {
				en: { a: { d: 'D' }, b: 'B' },
			})['en'],
		).toEqual({ a: { d: 'D' }, b: 'B' });
	});

	test('keeps a __proto__ key a key, for the check to refuse', () => {
		const project = JSON.parse('{"en":{"__proto__":{"x":"y"}}}');
		const merged = layerCatalogues([{ en: { a: 'A' } }], project);
		expect(Object.keys(merged['en'] as object)).toEqual(['a', '__proto__']);
		expect(() => checkCatalogues(merged, ['en'], 'en')).toThrow(
			'i18n: en: __proto__ is not camelCase',
		);
	});
});
