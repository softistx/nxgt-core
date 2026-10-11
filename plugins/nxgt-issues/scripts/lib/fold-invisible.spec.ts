import { describe, expect, test } from 'bun:test';
import { buildDenyList } from './deny';
import { normalize } from './fold';
import { scrub } from './scrub';

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
