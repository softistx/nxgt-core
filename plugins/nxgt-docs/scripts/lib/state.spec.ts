import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { record, reported } from './state';

const dir = mkdtempSync(join(tmpdir(), 'nxgt-docs-state-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('state', () => {
	test('a session starts with nothing reported and keeps what it records', () => {
		expect(reported(dir, 's1')).toEqual([]);
		record(dir, 's1', 'a');
		record(dir, 's1', 'b');
		record(dir, 's1', 'a');
		expect(reported(dir, 's1')).toEqual(['b', 'a']);
		expect(reported(dir, 's2')).toEqual([]);
	});

	test('a session id cannot escape the folder', () => {
		record(dir, '../evil', 'x');
		expect(reported(dir, '../evil')).toEqual(['x']);
	});

	test('a corrupt file reads as nothing reported', () => {
		writeFileSync(join(dir, 'bad.json'), '{ nope');
		expect(reported(dir, 'bad')).toEqual([]);
	});
});
