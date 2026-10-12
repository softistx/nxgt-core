import { describe, expect, test } from 'bun:test';
import { HIDDEN_SOURCE } from './hidden-chars';

const hidden = new RegExp(`^(?:${HIDDEN_SOURCE})$`, 'u');

describe('hidden-chars', () => {
	test('covers every assigned default-ignorable code point', () => {
		const missing: string[] = [];
		for (let code = 0; code <= 0x10ffff; code++) {
			if (code >= 0xd800 && code <= 0xdfff) continue;
			const char = String.fromCodePoint(code);
			if (/\p{DI}/u.test(char) && /\P{Cn}/u.test(char) && !hidden.test(char)) {
				missing.push(code.toString(16));
			}
		}
		expect(missing).toEqual([]);
	});
});
