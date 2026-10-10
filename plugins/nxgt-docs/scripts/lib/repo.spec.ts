import { describe, expect, test } from 'bun:test';
import { gitArgv, parseStatus } from './repo';

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

	test('reads both sides of an intent-to-add rename ( R)', () => {
		expect(parseStatus(' R src/new.ts\0src/old.ts\0')).toEqual([
			'src/new.ts',
			'src/old.ts',
		]);
	});

	test('empty output is no file', () => {
		expect(parseStatus('')).toEqual([]);
	});
});

describe('gitArgv', () => {
	test('never takes optional locks, so git status leaves index.lock alone', () => {
		expect(gitArgv('/r', ['status'])).toEqual([
			'git',
			'--no-optional-locks',
			'-C',
			'/r',
			'status',
		]);
	});
});
