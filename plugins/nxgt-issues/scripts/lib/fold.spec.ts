import { describe, expect, test } from 'bun:test';
import { buildDenyList } from './deny';
import { fold, normalize } from './fold';
import { scrub } from './scrub';

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
		expect(normalize('vexora%2Dapi%20x')).toBe('vexora-api x');
		expect(normalize('100% sure %zz %E0%A4%A')).toBe('100% sure %zz %E0%A4%A');
	});

	test('percent-encoding is decoded until stable, at most three rounds', () => {
		expect(normalize('vexora%252Dapi')).toBe('vexora-api');
		expect(normalize('vexora%25252Dapi')).toBe('vexora-api');
		expect(normalize('quillon%2525252Dapi')).toBe('quillon%2Dapi');
	});

	test('a lone %25 in normal text is only decoded to a percent sign', () => {
		expect(normalize('100%25 sure')).toBe('100% sure');
		expect(normalize('50%2525 off')).toBe('50% off');
		expect(normalize('100% sure')).toBe('100% sure');
	});

	test('a double- and a triple-encoded separator in a deny-listed name is refused', () => {
		const list = buildDenyList({ privateRepos: ['acme/zorblax-vault'] });
		for (const text of ['zorblax%252Dvault', 'zorblax%25252Dvault']) {
			expect(scrub(`see ${text} here`, { denyList: list }).denied).toContain(
				'zorblax-vault',
			);
		}
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
