import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createTranslator, getLanguage } from './i18n.browser';

/**
 * Pins the `browser` condition's behaviour: same answers as `./i18n`, minus
 * the Hono request context that a browser bundle never has a request to read
 * from in the first place.
 */
const resources = {
	en: { greeting: 'Hello, {name}', plain: 'Plain' },
	fr: { greeting: 'Bonjour, {name}', plain: 'Simple' },
};

describe('createTranslator (browser)', () => {
	it('formats against the provider it was built with', () => {
		const t = createTranslator<'greeting'>(resources, () => 'fr');
		expect(t('greeting', { name: 'Steve' })).toBe('Bonjour, Steve');
	});

	it('accepts a language in place of a provider function', () => {
		const t = createTranslator<'plain'>(resources, 'fr');
		expect(t('plain')).toBe('Simple');
	});
});

describe('getLanguage (browser)', () => {
	it('falls back to en with no localStorage', () => {
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
});

describe('the browser entry point', () => {
	it('never imports a Node-only module', () => {
		const source = readFileSync(
			new URL('./i18n.browser.ts', import.meta.url),
			'utf-8',
		);
		expect(source).not.toMatch(/^import .*['"]hono\/context-storage['"]/m);
		expect(source).not.toMatch(/^import .*['"]node:/m);
	});

	// Skips gracefully when run before a build — this is the same ordering the
	// rest of the workspace already depends on (AGENTS.md: "The build must run
	// before typecheck and tests"). CI always builds first.
	const distIndex = new URL('../dist/index.browser.js', import.meta.url);
	const distExists = (() => {
		try {
			readFileSync(distIndex);
			return true;
		} catch {
			return false;
		}
	})();

	it.skipIf(!distExists)(
		'the built artifact carries the same guarantee',
		() => {
			const built = readFileSync(distIndex, 'utf-8');
			expect(built).not.toMatch(/hono\/context-storage/);
			expect(built).not.toMatch(/from ["']node:/);
		},
	);
});
