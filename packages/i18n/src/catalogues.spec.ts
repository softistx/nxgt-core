import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
	getFallbackLanguage,
	registerCatalogue,
	registeredCatalogues,
	setFallbackLanguage,
} from './catalogues';
import { SUPPORTED_LANGUAGES } from './consts';
import { createTranslator, getLanguage, translate } from './i18n';
import { resources } from './resources';
import { registerLanguageSource } from './sources';

/**
 * Since 3.0 a language is data an app registers: a third language reaches
 * `translate` and `getLanguage()` with no change to this package. The state
 * is the process's, so each test runs on a copy of it and puts it back.
 */
const STATE = Symbol.for('@nxgt/i18n/catalogues@3');
const shared = () => (globalThis as any)[STATE];

let saved: any;
const removals: (() => void)[] = [];
beforeEach(() => {
	const state = shared();
	saved = {
		base: { ...state.base },
		registered: { ...state.registered },
		catalogues: { ...state.catalogues },
		languages: [...state.languages],
		fallback: state.fallback,
	};
});
afterEach(() => {
	for (const remove of removals.splice(0)) remove();
	const state = shared();
	for (const slot of ['base', 'registered', 'catalogues'] as const) {
		for (const key of Object.keys(state[slot])) delete state[slot][key];
		Object.assign(state[slot], saved[slot]);
	}
	// Restored in place: SUPPORTED_LANGUAGES is this very array.
	state.languages.splice(0, Infinity, ...saved.languages);
	state.fallback = saved.fallback;
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
	});

	it('merges successive registrations for one language', () => {
		registerCatalogue('de', { a: { b: 'eins' } });
		registerCatalogue('de', { a: { c: 'zwei' } });
		expect(registeredCatalogues()['de']).toEqual({
			a: { b: 'eins', c: 'zwei' },
		});
		expect(SUPPORTED_LANGUAGES.filter((l) => l === 'de')).toHaveLength(1);
	});

	it('refuses an empty name, __proto__, and a catalogue that is not an object', () => {
		expect(() => registerCatalogue('', {})).toThrow(TypeError);
		expect(() => registerCatalogue('__proto__', {})).toThrow(TypeError);
		expect(() => registerCatalogue('nl', 'x' as any)).toThrow(TypeError);
		expect(SUPPORTED_LANGUAGES).not.toContain('nl');
		expect(SUPPORTED_LANGUAGES).not.toContain('__proto__');
	});

	it('takes a language named like an Object.prototype member', () => {
		registerCatalogue('constructor', { hello: 'odd but fine' });
		expect(translate('hello' as any, undefined, 'constructor')).toBe(
			'odd but fine',
		);
	});
});

describe('two copies of the package', () => {
	it('share registrations through globalThis', async () => {
		const path = './catalogues?copy=share';
		const copy = await import(path);
		copy.registerCatalogue('de', { hallo: 'Hallo' });
		expect(registeredCatalogues()['de']).toEqual({ hallo: 'Hallo' });
		expect(copy.supportedLanguages()).toBe(SUPPORTED_LANGUAGES);
	});

	it('add the keys a later copy ships, keeping the first one’s messages', async () => {
		const state = shared();
		state.base.en = { errors: { 'not-found': 'first copy' } };
		// A fresh query each run: an imported module runs once.
		const path = `./catalogues?copy=${crypto.randomUUID()}`;
		await import(path);
		expect(state.base.en.errors['not-found']).toBe('first copy');
		expect(state.base.en.errors.unauthenticated).toBe(
			resources.en.errors.unauthenticated,
		);
		expect(translate('errors.unauthenticated', undefined, 'en')).toBe(
			resources.en.errors.unauthenticated,
		);
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

describe('a key the language lacks', () => {
	it('is looked up in the fallback language before answering the key', () => {
		registerCatalogue('de', { only: 'Nur Deutsch' });
		expect(translate('errors.not-found', undefined, 'de')).toBe(
			resources.en.errors['not-found'],
		);
		setFallbackLanguage('fr');
		expect(translate('errors.not-found', undefined, 'de')).toBe(
			resources.fr.errors['not-found'],
		);
		expect(translate('nothing.here' as any, undefined, 'de')).toBe(
			'nothing.here',
		);
	});

	it('falls back for a translator with no catalogue for the language at all', () => {
		const t = createTranslator<'greeting'>({ en: { greeting: 'Hello' } }, 'pt');
		expect(t('greeting')).toBe('Hello');
	});

	it('answers the key for a path that leads to a branch, not a message', () => {
		expect(translate('errors' as any, undefined, 'en')).toBe('errors');
	});
});

describe('registerCatalogue with { replace: true }', () => {
	it('drops the keys an earlier registration had, keeping the package’s', () => {
		registerCatalogue('en', {
			retired: 'Old',
			errors: { 'not-found': 'Gone' },
		});
		registerCatalogue('en', { kept: 'New' }, { replace: true });
		expect(translate('retired' as any, undefined, 'en')).toBe('retired');
		expect(translate('kept' as any, undefined, 'en')).toBe('New');
		expect(translate('errors.not-found', undefined, 'en')).toBe(
			resources.en.errors['not-found'],
		);
		expect(registeredCatalogues()['en']).not.toHaveProperty('retired');
	});

	it('registers a new language as a merge would', () => {
		registerCatalogue('de', { hallo: 'Hallo' }, { replace: true });
		expect(SUPPORTED_LANGUAGES).toContain('de');
		expect(translate('hallo' as any, undefined, 'de')).toBe('Hallo');
	});
});
