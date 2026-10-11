import { describe, expect, test } from 'bun:test';
import { fold, normalize } from './fold';

describe('normalize', () => {
	test.each([
		['\uFF53\uFF45\uFF43', 'sec'],
		['a\u200Bb\u00ADc\uFEFFd', 'abcd'],
		['a<!-- hidden -->b', 'ab'],
		['a<!--\nmulti\nline-->b', 'ab'],
		['a&#45;b&#x2D;c&amp;d', 'a-b-c&d'],
		['a&hyphen;b&nbsp;c', 'a-b c'],
		['a\\-b \\_c \\*d', 'a-b _c *d'],
		['&#99999999999;x', 'x'],
		['plain text, unchanged', 'plain text, unchanged'],
	])('%p -> %p', (input, expected) => {
		expect(normalize(input)).toBe(expected);
	});

	test('percent-encoding is decoded; a malformed run is left alone', () => {
		expect(normalize('schoolz%2Dapi%20x')).toBe('schoolz-api x');
		expect(normalize('100% sure %zz %E0%A4%A')).toBe('100% sure %zz %E0%A4%A');
	});

	test('an unknown named entity is left as written', () => {
		expect(normalize('a&nosuch;b')).toBe('a&nosuch;b');
	});
});

describe('fold', () => {
	test.each([
		['Secret App'],
		['secret_app'],
		['SecretApp'],
		['secret.app'],
		['secret\u2010app'],
		['secret\u2212app'],
		['secret&#45;app'],
		['secret-<!-- -->app'],
		['\uFF53ecret-app'],
		['secret\\-app'],
		['sec\u200Bret\u00AD-app'],
		['secret%2Dapp'],
		['secret/app'],
	])('%p folds to secretapp', (input) => {
		expect(fold(input)).toBe('secretapp');
	});

	test('other punctuation stays', () => {
		expect(fold('@Jane/Web')).toBe('@janeweb');
		expect(fold('Doe, Jane')).toBe('doe,jane');
	});
});
