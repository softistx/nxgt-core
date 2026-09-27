import { describe, expect, test } from 'bun:test';
import { keyVariants, normalizeKey, normalizeSegment } from './keys';

describe('normalizeSegment', () => {
	test('folds camelCase and kebab-case to the same string', () => {
		expect(normalizeSegment('signIn')).toBe(normalizeSegment('sign-in'));
	});

	test('leaves a single lowercase word as is', () => {
		expect(normalizeSegment('title')).toBe('title');
	});
});

describe('normalizeKey', () => {
	test('normalizes every segment of a dotted key', () => {
		expect(normalizeKey('auth.signIn')).toBe(normalizeKey('auth.sign-in'));
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
