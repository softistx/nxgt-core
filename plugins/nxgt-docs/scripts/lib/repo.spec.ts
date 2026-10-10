import { describe, expect, test } from 'bun:test';
import { parseStatus } from './repo';

describe('parseStatus', () => {
	test('reads modified, untracked and both sides of a rename', () => {
		const out = [
			' M src/a.ts',
			'?? new file.ts',
			'R  src/new.ts',
			'src/old.ts',
			'',
		].join('\0');
		expect(parseStatus(out)).toEqual([
			'src/a.ts',
			'new file.ts',
			'src/new.ts',
			'src/old.ts',
		]);
	});

	test('empty output is no file', () => {
		expect(parseStatus('')).toEqual([]);
	});
});
