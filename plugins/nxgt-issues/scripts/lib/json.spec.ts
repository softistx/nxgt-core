import { describe, expect, test } from 'bun:test';
import { nodes, obj, text } from './json';

describe('json helpers', () => {
	test('obj is the object itself, else an empty one', () => {
		const value = { a: 1 };
		expect(obj(value)).toBe(value);
		for (const other of [null, undefined, 'x', 3, true]) {
			expect(obj(other)).toEqual({});
		}
	});

	test('text is the string itself, else empty', () => {
		expect(text('abc')).toBe('abc');
		for (const other of [null, undefined, 3, {}, ['a']]) {
			expect(text(other)).toBe('');
		}
	});

	test('nodes is the objects of a GraphQL connection, else none', () => {
		expect(nodes({ nodes: [{ a: 1 }, null, 'x'] })).toEqual([{ a: 1 }, {}, {}]);
		for (const other of [null, {}, { nodes: 'x' }, 'x']) {
			expect(nodes(other)).toEqual([]);
		}
	});
});
