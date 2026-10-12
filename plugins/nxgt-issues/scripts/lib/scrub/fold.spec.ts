import { describe, expect, test } from 'bun:test';
import { buildDenyList } from './deny';
import { fold, normalize } from './fold';
import { scrub } from './scrub';

const list0 = buildDenyList({ privateRepos: [] });

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

	test('an entity hidden in percent-encoding, and the reverse, is decoded', () => {
		expect(normalize('quin%26%23116%3Bor')).toBe('quintor');
		expect(normalize('quin&#37;74or')).toBe('quintor');
		expect(normalize('quin%26amp%3B%2374%3Bor')).toBe('quinJor');
	});

	test('prose with an entity or a lone percent is unchanged', () => {
		expect(normalize('a &amp; b')).toBe('a & b');
		expect(normalize('100% and %s and 50%')).toBe('100% and %s and 50%');
		expect(normalize('&lt;b&gt; %d')).toBe('<b> %d');
	});

	test('an entity-encoded name in percent-encoding is denied', () => {
		const list = buildDenyList({ privateRepos: ['acme/quintor'] });
		for (const text of ['quin%26%23116%3Bor', 'quin&#37;74or']) {
			expect(scrub(`see ${text}`, { denyList: list }).denied).toContain(
				'quintor',
			);
		}
	});

	test('a double-encoded credential assignment is refused', () => {
		expect(scrub('password%253Dx1y2z3', { denyList: list0 }).secrets).toContain(
			'password',
		);
	});

	test('a malformed byte in a run does not keep the valid escapes encoded', () => {
		expect(normalize('quinto%72%80')).toBe('quintor%80');
		expect(normalize('quinto%2572%26%2337%3B80')).toBe('quintor%80');
		expect(normalize('a%80b')).toBe('a%80b');
		expect(normalize('%E0%A4%A')).toBe('%E0%A4%A');
	});

	test('the fallback decodes two-, three- and four-byte sequences beside a malformed byte', () => {
		expect(normalize('caf%C3%A9%80')).toBe('café%80');
		expect(normalize('a%E2%80%93%FF')).toBe('a–%FF');
		expect(normalize('%F0%9F%98%80%80')).toBe('😀%80');
		expect(normalize('%C3%A9%C3')).toBe('é%C3');
	});

	test('a name followed by a malformed byte is still denied', () => {
		const list = buildDenyList({ privateRepos: ['acme/quintor'] });
		for (const text of ['quinto%72%80', 'quinto%2572%26%2337%3B80']) {
			expect(scrub(`see ${text}`, { denyList: list }).denied).toContain(
				'quintor',
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

const list = buildDenyList({ privateRepos: ['acme/zorblax-vault'] });

/** One representative of each class of character that renders as nothing. */
const CLASSES: ReadonlyArray<[string, number]> = [
	['Khmer inherent vowel AQ', 0x17b4],
	['Khmer inherent vowel AA', 0x17b5],
	['Mongolian free variation selector one', 0x180b],
	['Mongolian free variation selector two', 0x180c],
	['Mongolian free variation selector three', 0x180d],
	['Mongolian free variation selector four', 0x180f],
	['bidi isolate', 0x2066],
	['Arabic letter mark', 0x061c],
	['interlinear annotation anchor', 0xfff9],
	['private use', 0xe000],
	['Braille blank', 0x2800],
	['tag character', 0xe0041],
	['variation selector', 0xfe0f],
	['variation selector supplement', 0xe0100],
	['Hangul choseong filler', 0x115f],
	['Hangul jungseong filler', 0x1160],
	['Hangul filler', 0x3164],
	['halfwidth Hangul filler', 0xffa0],
];

describe.each(CLASSES)('%s hidden in a text', (_, code) => {
	const hidden = String.fromCodePoint(code);

	test('normalize drops it', () => {
		expect(normalize(`a${hidden}b`)).toBe('ab');
	});

	test('a private name split by it is still denied', () => {
		const text = `see zorb${hidden}lax-vault for it`;
		expect(scrub(text, { denyList: list }).denied).toContain('zorblax-vault');
	});

	test('a credential keyword split by it still refuses its value', () => {
		const text = `pass${hidden}word: hunter22xyz`;
		expect(scrub(text, { denyList: list }).secrets).toContain('password');
	});
});
