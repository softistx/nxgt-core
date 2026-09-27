import { describe, expect, test } from 'bun:test';
import { keyVariants, sameSegment } from './keys';

describe('sameSegment', () => {
	test('is true for the same string', () => {
		expect(sameSegment('title', 'title')).toBe(true);
	});

	test('is true for camelCase and its kebab-case spelling, either order', () => {
		expect(sameSegment('signIn', 'sign-in')).toBe(true);
		expect(sameSegment('sign-in', 'signIn')).toBe(true);
	});

	test('is false for two different words that happen to share letters and a hyphen', () => {
		// `coop` and `co-op` both pass KEY_SEGMENT and are unrelated words — a
		// lossy hyphen/case fold would confuse them; the exact-alternate check
		// must not.
		expect(sameSegment('coop', 'co-op')).toBe(false);
		expect(sameSegment('co-op', 'coop')).toBe(false);
	});

	test('is false for two unrelated words', () => {
		expect(sameSegment('signIn', 'signOut')).toBe(false);
	});
});

describe('keyVariants', () => {
	test('yields the kebab-case spelling of a camelCase key', () => {
		expect(keyVariants('auth.signIn')).toEqual(['auth.signIn', 'auth.sign-in']);
	});

	test('yields the camelCase spelling of a kebab-case key', () => {
		expect(keyVariants('auth.sign-in')).toEqual([
			'auth.sign-in',
			'auth.signIn',
		]);
	});

	test('a single-word segment has no other spelling', () => {
		expect(keyVariants('home.title')).toEqual(['home.title']);
	});

	test('crosses variants across several segments that each have one', () => {
		expect(keyVariants('signIn.signOut')).toEqual([
			'signIn.signOut',
			'signIn.sign-out',
			'sign-in.signOut',
			'sign-in.sign-out',
		]);
	});
});
