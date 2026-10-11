import { describe, expect, test } from 'bun:test';
import { buildDenyList } from './deny';
import { normalize } from './fold';
import { scrub } from './scrub';

const list = buildDenyList({ privateRepos: ['acme/zorblax-vault'] });

/** One representative of each class of character that renders as nothing. */
const CLASSES: ReadonlyArray<[string, number]> = [
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
