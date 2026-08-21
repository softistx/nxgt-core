import { describe, expect, test } from 'bun:test';
import { addFilterCondition, buildRegexFilter } from './filter.utils';

describe('buildRegexFilter', () => {
	test('Should return the condition alone, without the field name', () => {
		expect(buildRegexFilter('jane')).toEqual({ $regex: 'jane', $options: 'i' });
	});

	test('Should escape regex metacharacters in the search term', () => {
		// The term arrives from a request body, so it is matched literally
		// rather than compiled as a pattern.
		expect(buildRegexFilter('a.b@c.com')).toEqual({
			$regex: 'a\\.b@c\\.com',
			$options: 'i',
		});
		expect(buildRegexFilter('(a+)+$')).toEqual({
			$regex: '\\(a\\+\\)\\+\\$',
			$options: 'i',
		});
	});

	test('Should return undefined for an absent or empty term', () => {
		expect(buildRegexFilter(undefined)).toBeUndefined();
		expect(buildRegexFilter('')).toBeUndefined();
	});
});

describe('buildRegexFilter with addFilterCondition', () => {
	test('Should key the condition by the field exactly once', () => {
		const filter = {};

		addFilterCondition(filter, 'username', buildRegexFilter('jane'));

		// Returning `{ [field]: … }` from the builder keyed it twice, giving
		// `{ username: { username: { $regex } } }` — which Mongoose rejects with
		// a CastError on every search that used it.
		expect(filter).toEqual({ username: { $regex: 'jane', $options: 'i' } });
	});

	test('Should leave the field out when there is nothing to search for', () => {
		const filter = {};

		addFilterCondition(filter, 'email', buildRegexFilter(undefined));

		expect(filter).toEqual({});
	});
});
