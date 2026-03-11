import { describe, expect, it } from 'bun:test';
import { isEqual } from 'lodash';
import { toCamelCase, toSnakeCase } from './object.utils';

describe('toCamelCase', () => {
	it('should convert snake_case keys to camelCase', () => {
		const input = {
			user_id: 1,
			user_name: 'John Doe',
		};
		const expected = {
			userId: 1,
			userName: 'John Doe',
		};
		expect(isEqual(toCamelCase(input), expected)).toBeTrue();
	});

	it('should convert nested objects', () => {
		const input = {
			user_id: 1,
			user_name: 'John Doe',
			profile: {
				first_name: 'John',
				last_name: 'Doe',
			},
		};
		const expected = {
			userId: 1,
			userName: 'John Doe',
			profile: {
				firstName: 'John',
				lastName: 'Doe',
			},
		};
		expect(isEqual(toCamelCase(input), expected)).toBeTrue();
	});
});

describe('toSnakeCase', () => {
	it('should convert camelCase keys to snake_case', () => {
		const input = {
			userId: 1,
			userName: 'John Doe',
		};
		const expected = {
			user_id: 1,
			user_name: 'John Doe',
		};
		expect(isEqual(toSnakeCase(input), expected)).toBeTrue();
	});

	it('should convert nested objects', () => {
		const input = {
			userId: 1,
			userName: 'John Doe',
			profile: {
				firstName: 'John',
				lastName: 'Doe',
			},
		};
		const expected = {
			user_id: 1,
			user_name: 'John Doe',
			profile: {
				first_name: 'John',
				last_name: 'Doe',
			},
		};
		expect(isEqual(toSnakeCase(input), expected)).toBeTrue();
	});
});
