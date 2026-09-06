import { describe, expect, it } from 'bun:test';
import { createTranslator, getLanguage } from './i18n';

/**
 * The two repositories forked how a translator decides which language to use —
 * `localStorage` on one side, the Hono request context on the other — and
 * neither had a test. These pin the merged behaviour: an explicit provider
 * always wins, and the default asks both.
 */
const resources = {
	en: { greeting: 'Hello, {name}', plain: 'Plain' },
	fr: { greeting: 'Bonjour, {name}', plain: 'Simple' },
};

describe('createTranslator', () => {
	it('formats against the provider it was built with', () => {
		const t = createTranslator<'greeting'>(resources, () => 'fr');
		expect(t('greeting', { name: 'Steve' })).toBe('Bonjour, Steve');
	});

	it('takes a per-call override as its third argument', () => {
		const t = createTranslator<'greeting'>(resources, () => 'fr');
		expect(t('greeting', { name: 'Steve' }, () => 'en')).toBe('Hello, Steve');
	});

	it('accepts a language in place of a provider function', () => {
		const t = createTranslator<'plain'>(resources, 'fr');
		expect(t('plain')).toBe('Simple');
	});

	it('answers the key itself when nothing translates it', () => {
		const t = createTranslator<string>(resources, () => 'en');
		expect(t('nothing.here')).toBe('nothing.here');
	});
});

describe('getLanguage', () => {
	it('falls back to en with no request context and no localStorage', () => {
		expect(getLanguage()).toBe('en');
	});

	it('reads localStorage when it holds a supported language', () => {
		const original = globalThis.localStorage;
		// biome-ignore lint/suspicious/noExplicitAny: minimal stand-in for the DOM API
		(globalThis as any).localStorage = {
			getItem: (k: string) => (k === 'language' ? 'fr' : null),
		};
		try {
			expect(getLanguage()).toBe('fr');
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restoring the stand-in
			(globalThis as any).localStorage = original;
		}
	});

	it('ignores a stored value that is not a supported language', () => {
		const original = globalThis.localStorage;
		// biome-ignore lint/suspicious/noExplicitAny: minimal stand-in for the DOM API
		(globalThis as any).localStorage = { getItem: () => 'klingon' };
		try {
			expect(getLanguage()).toBe('en');
		} finally {
			// biome-ignore lint/suspicious/noExplicitAny: restoring the stand-in
			(globalThis as any).localStorage = original;
		}
	});
});
