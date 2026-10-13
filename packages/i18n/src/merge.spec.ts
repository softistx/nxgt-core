import { describe, expect, it } from 'bun:test';
import { mergeCatalogues } from './merge';
import { resources } from './resources';

/**
 * A spread replaced whole branches: an app spreading its own `validation`
 * over the package's dropped every package key under it, silently.
 */
describe('mergeCatalogues', () => {
	it('keeps the keys of a branch an override names only in part', () => {
		const merged = mergeCatalogues(resources.en, {
			validation: { errors: { required: 'Needed' } },
		});
		expect(merged.validation.errors.required).toBe('Needed');
		const others = Object.keys(resources.en.validation.errors).filter(
			(key) => key !== 'required',
		);
		expect(others.length).toBeGreaterThan(0);
		for (const key of others) {
			expect((merged.validation.errors as Record<string, string>)[key]).toBe(
				(resources.en.validation.errors as Record<string, string>)[key],
			);
		}
	});

	it('lets the last override win leaf by leaf', () => {
		const merged = mergeCatalogues(
			{ a: { b: 'base', c: 'base' } },
			{ a: { b: 'first', c: 'first' } },
			{ a: { b: 'last' } },
		);
		expect(merged).toEqual({ a: { b: 'last', c: 'first' } });
	});

	it('replaces a branch with a leaf and a leaf with a branch', () => {
		const merged = mergeCatalogues(
			{ a: { b: 'x' }, c: 'leaf' } as Record<string, any>,
			{ a: 'now a leaf', c: { d: 'now a branch' } },
		);
		expect(merged).toEqual({ a: 'now a leaf', c: { d: 'now a branch' } });
	});

	it('skips undefined and null, so an override never erases a message', () => {
		const merged = mergeCatalogues({ a: 'kept', b: 'kept' }, {
			a: undefined,
			b: null,
		} as unknown as Record<string, string>);
		expect(merged).toEqual({ a: 'kept', b: 'kept' });
	});

	it('changes none of its inputs and shares no branch with them', () => {
		const base = { a: { b: 'base' } };
		const override = { a: { c: 'override' }, d: { e: 'new' } };
		const merged = mergeCatalogues(base, override) as Record<string, any>;
		expect(base).toEqual({ a: { b: 'base' } });
		expect(override).toEqual({ a: { c: 'override' }, d: { e: 'new' } });
		expect(merged['a']).not.toBe(base.a);
		expect(merged['d']).not.toBe(override.d);
		merged['d'].e = 'changed';
		expect(override.d.e).toBe('new');
	});

	it('never lets a __proto__ key reach the prototype', () => {
		const hostile = JSON.parse('{"__proto__": {"polluted": "yes"}, "a": "ok"}');
		const merged = mergeCatalogues({}, hostile) as Record<string, any>;
		expect(merged['a']).toBe('ok');
		expect(merged['polluted']).toBeUndefined();
		expect(({} as Record<string, any>)['polluted']).toBeUndefined();
		expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
	});

	it('refuses an argument that is not a catalogue', () => {
		expect(() => mergeCatalogues({}, 'x' as any)).toThrow(TypeError);
		expect(() => mergeCatalogues(null as any)).toThrow(TypeError);
		expect(() => mergeCatalogues({}, [] as any)).toThrow(TypeError);
	});
});
