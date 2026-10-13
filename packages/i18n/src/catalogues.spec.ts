import { afterEach, describe, expect, it } from 'bun:test';
import {
	getFallbackLanguage,
	registerCatalogue,
	registeredCatalogues,
	setFallbackLanguage,
} from './catalogues';
import { SUPPORTED_LANGUAGES } from './consts';
import { getLanguage, translate } from './i18n';
import { resources } from './resources';
import { registerLanguageSource } from './sources';

/**
 * Since 3.0 a language is data an app registers: a third language reaches
 * `translate` and `getLanguage()` with no change to this package. The state
 * is the process's, so each test registers a language of its own.
 */
const removals: (() => void)[] = [];
afterEach(() => {
	for (const remove of removals.splice(0)) remove();
	setFallbackLanguage('en');
});

describe('registerCatalogue', () => {
	it('makes a new language supported, translated and accepted from a source', () => {
		expect(SUPPORTED_LANGUAGES).not.toContain('de');
		registerCatalogue('de', { errors: { 'not-found': 'Nicht gefunden' } });
		expect(SUPPORTED_LANGUAGES).toContain('de');
		removals.push(registerLanguageSource(() => 'de'));
		expect(getLanguage()).toBe('de');
		expect(translate('errors.not-found')).toBe('Nicht gefunden');
	});

	it('merges over the language’s catalogue, keeping what it leaves out', () => {
		registerCatalogue('fr', { errors: { 'not-found': 'Introuvable (app)' } });
		expect(translate('errors.not-found', undefined, 'fr')).toBe(
			'Introuvable (app)',
		);
		expect(translate('errors.unauthenticated', undefined, 'fr')).toBe(
			resources.fr.errors.unauthenticated,
		);
		// The package's own catalogue is not changed.
		expect(resources.fr.errors['not-found']).not.toBe('Introuvable (app)');
		registerCatalogue('fr', {
			errors: { 'not-found': resources.fr.errors['not-found'] },
		});
	});

	it('merges successive registrations for one language', () => {
		registerCatalogue('it', { a: { b: 'uno' } });
		registerCatalogue('it', { a: { c: 'due' } });
		expect(registeredCatalogues()['it']).toEqual({ a: { b: 'uno', c: 'due' } });
		expect(SUPPORTED_LANGUAGES.filter((l) => l === 'it')).toHaveLength(1);
	});

	it('refuses an empty language name and a catalogue that is not an object', () => {
		expect(() => registerCatalogue('', {})).toThrow(TypeError);
		expect(() => registerCatalogue('nl', 'x' as any)).toThrow(TypeError);
		expect(SUPPORTED_LANGUAGES).not.toContain('nl');
	});

	it('is shared by two copies of the package through globalThis', () => {
		const state = (globalThis as any)[Symbol.for('@nxgt/i18n/catalogues')];
		registerCatalogue('es', { hola: 'Hola' });
		expect(state.catalogues.es).toEqual({ hola: 'Hola' });
		expect(state.languages).toBe(SUPPORTED_LANGUAGES);
	});
});

describe('setFallbackLanguage', () => {
	it('is what getLanguage() answers when nothing names a language', () => {
		expect(getFallbackLanguage()).toBe('en');
		setFallbackLanguage('fr');
		expect(getFallbackLanguage()).toBe('fr');
		expect(getLanguage()).toBe('fr');
	});

	it('takes a registered language, and refuses one with no catalogue', () => {
		expect(() => setFallbackLanguage('sv')).toThrow(RangeError);
		expect(getFallbackLanguage()).toBe('en');
		registerCatalogue('sv', { hej: 'Hej' });
		setFallbackLanguage('sv');
		expect(getLanguage()).toBe('sv');
	});
});
