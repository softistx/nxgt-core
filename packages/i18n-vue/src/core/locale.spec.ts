import { describe, expect, it } from 'bun:test';
import { expectThrow } from '../../test/expect-throw';
import { detectLocale, parseAcceptLanguage, pickLocale } from './locale';

const supported = ['en', 'fr'] as const;

describe('pickLocale', () => {
	it('answers the first wanted locale that is supported', () => {
		expect(pickLocale(['de', 'fr', 'en'], supported, 'en')).toBe('fr');
		expect(pickLocale('fr', supported, 'en')).toBe('fr');
	});

	it('matches on the language when the region is not supported', () => {
		expect(pickLocale('fr-CA', supported, 'en')).toBe('fr');
		expect(pickLocale('fr_CA', supported, 'en')).toBe('fr');
	});

	it('matches a region it supports when only the language is wanted', () => {
		expect(pickLocale('pt', ['en', 'pt-BR'], 'en')).toBe('pt-BR');
	});

	it('prefers an exact match to a language match, and keeps the order of wanted', () => {
		expect(pickLocale('fr-CA', ['fr', 'fr-CA'], 'fr')).toBe('fr-CA');
		expect(pickLocale('fr-BE', ['fr-CA', 'fr'], 'fr-CA')).toBe('fr');
		// The first wanted locale wins, even when a later one is an exact match.
		expect(pickLocale(['fr-CH', 'en'], supported, 'en')).toBe('fr');
	});

	it('ignores case, and answers the supported spelling', () => {
		expect(pickLocale('PT-br', ['en', 'pt-BR'], 'en')).toBe('pt-BR');
	});

	it('answers the fallback when nothing is wanted or nothing matches', () => {
		expect(pickLocale(null, supported, 'en')).toBe('en');
		expect(pickLocale(undefined, supported, 'fr')).toBe('fr');
		expect(pickLocale([], supported, 'en')).toBe('en');
		expect(pickLocale(['', null, 'de'], supported, 'en')).toBe('en');
	});

	it('refuses a wiring mistake with a TypeError', () => {
		expectThrow(
			() => pickLocale('fr', [], 'en' as never),
			TypeError,
			'pickLocale: supported must hold at least one locale',
		);
		expectThrow(
			() => pickLocale('fr', supported, 'de' as never),
			TypeError,
			'pickLocale: fallback must be one of supported',
		);
	});
});

describe('parseAcceptLanguage', () => {
	it('orders by weight, ties keeping the header order', () => {
		expect(parseAcceptLanguage('fr-CA,fr;q=0.9,en;q=0.8')).toEqual([
			'fr-CA',
			'fr',
			'en',
		]);
		expect(parseAcceptLanguage('en;q=0.5, de, fr;q=0.5')).toEqual([
			'de',
			'en',
			'fr',
		]);
	});

	it('drops q=0, the wildcard and empty entries', () => {
		expect(parseAcceptLanguage('fr;q=0, *, , en')).toEqual(['en']);
	});

	it('answers [] for a missing header', () => {
		expect(parseAcceptLanguage(null)).toEqual([]);
		expect(parseAcceptLanguage(undefined)).toEqual([]);
		expect(parseAcceptLanguage('')).toEqual([]);
	});

	it('feeds pickLocale', () => {
		expect(
			pickLocale(
				['de', ...parseAcceptLanguage('fr-CA,en;q=0.5')],
				supported,
				'en',
			),
		).toBe('fr');
	});
});

describe('detectLocale', () => {
	const stub = (languages: readonly string[], stored: string | null) => {
		const saved = {
			navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
			localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
		};
		Object.defineProperty(globalThis, 'navigator', {
			value: { languages },
			configurable: true,
		});
		Object.defineProperty(globalThis, 'localStorage', {
			value: { getItem: (key: string) => (key === 'language' ? stored : null) },
			configurable: true,
		});
		return () => {
			for (const [name, descriptor] of Object.entries(saved)) {
				if (descriptor) Object.defineProperty(globalThis, name, descriptor);
				else delete (globalThis as Record<string, unknown>)[name];
			}
		};
	};

	it('prefers the stored locale, then the browser languages, then the fallback', () => {
		let restore = stub(['fr-CA', 'en'], 'en');
		try {
			expect(detectLocale(supported, 'en')).toBe('en');
		} finally {
			restore();
		}
		restore = stub(['de', 'fr-CA'], null);
		try {
			expect(detectLocale(supported, 'en')).toBe('fr');
			expect(detectLocale(supported, 'en', { storageKey: false })).toBe('fr');
		} finally {
			restore();
		}
		restore = stub(['de'], 'it');
		try {
			expect(detectLocale(supported, 'fr')).toBe('fr');
		} finally {
			restore();
		}
	});

	it('reads another key, or none', () => {
		const restore = stub([], 'fr');
		try {
			expect(detectLocale(supported, 'en', { storageKey: 'lang' })).toBe('en');
			expect(detectLocale(supported, 'en', { storageKey: false })).toBe('en');
		} finally {
			restore();
		}
	});

	it('treats storage that throws as no preference', () => {
		const restore = stub(['fr'], null);
		Object.defineProperty(globalThis, 'localStorage', {
			get() {
				throw new Error('SecurityError');
			},
			configurable: true,
		});
		try {
			expect(detectLocale(supported, 'en')).toBe('fr');
		} finally {
			restore();
		}
	});

	it('refuses a storage key that is not one', () => {
		expectThrow(
			() => detectLocale(supported, 'en', { storageKey: '' }),
			TypeError,
			'detectLocale: storageKey must be a localStorage key, or false to read none',
		);
	});
});
