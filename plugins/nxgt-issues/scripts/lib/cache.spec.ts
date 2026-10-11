import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	CACHE_TTL_MS,
	cachePath,
	describeAge,
	issuesHome,
	readEntry,
	writeEntry,
} from './cache';

describe('issuesHome', () => {
	test('NXGT_ISSUES_HOME wins', () => {
		expect(
			issuesHome({ NXGT_ISSUES_HOME: '/h', CLAUDE_CONFIG_DIR: '/c' }),
		).toBe('/h');
	});

	test('then CLAUDE_CONFIG_DIR', () => {
		expect(issuesHome({ CLAUDE_CONFIG_DIR: '/c' })).toBe('/c/nxgt-issues');
	});

	test('then ~/.claude', () => {
		expect(issuesHome({})).toBe(join(homedir(), '.claude', 'nxgt-issues'));
		expect(issuesHome({ NXGT_ISSUES_HOME: '', CLAUDE_CONFIG_DIR: '' })).toBe(
			join(homedir(), '.claude', 'nxgt-issues'),
		);
	});
});

describe('cachePath', () => {
	test('is <home>/cache/<owner>__<repo>.json, lower-cased', () => {
		expect(cachePath('/h', { owner: 'SteveGT96', repo: 'App.X' })).toBe(
			'/h/cache/stevegt96__app.x.json',
		);
	});

	test.each([
		['..', 'x'],
		['x', '..'],
		['.', 'x'],
		['a/b', 'x'],
		['x', 'a\\b'],
		['', 'x'],
	])('refuses %p/%p', (owner, repo) => {
		expect(() => cachePath('/h', { owner, repo })).toThrow(
			/refusing the cache name/,
		);
	});
});

describe('entries on disk', () => {
	const root = mkdtempSync(join(tmpdir(), 'nxgt-issues-cache-'));
	afterAll(() => rmSync(root, { recursive: true, force: true }));
	const file = join(root, 'cache', 'o__r.json');

	test('write then read: fresh within the TTL, stale after', () => {
		writeEntry(file, { issues: [1, 2] }, 1_000);
		const fresh = readEntry<{ issues: number[] }>(
			file,
			1_000 + CACHE_TTL_MS - 1,
		);
		expect(fresh).toEqual({
			data: { issues: [1, 2] },
			writtenAt: 1_000,
			ageMs: CACHE_TTL_MS - 1,
			fresh: true,
		});
		const stale = readEntry(file, 1_000 + CACHE_TTL_MS);
		expect(stale?.fresh).toBe(false);
	});

	test('the TTL is ten minutes and can be overridden', () => {
		expect(CACHE_TTL_MS).toBe(600_000);
		expect(readEntry(file, 1_000 + 5_000, 1_000)?.fresh).toBe(false);
	});

	test('a write dated in the future is stale, not fresh', () => {
		writeEntry(file, { n: 1 }, 5_000_000);
		const entry = readEntry(file, 1_000);
		expect(entry?.fresh).toBe(false);
		expect(entry?.ageMs).toBe(0);
	});

	test('a clock behind the write gives age zero', () => {
		expect(readEntry(file, 0)?.ageMs).toBe(0);
	});

	test('leaves no temporary file behind and replaces in place', () => {
		writeEntry(file, 'second', 2_000);
		expect(readEntry(file, 2_000)?.data).toBe('second');
		expect(readdirSync(join(root, 'cache'))).toEqual(['o__r.json']);
	});

	test('a missing, corrupt or malformed file is a miss', () => {
		expect(readEntry(join(root, 'nope.json'), 0)).toBeUndefined();
		const bad = join(root, 'bad.json');
		writeFileSync(bad, '{not json');
		expect(readEntry(bad, 0)).toBeUndefined();
		for (const body of [
			'null',
			'[]',
			'{"data":1}',
			'{"writtenAt":"x","data":1}',
			'{"writtenAt":1}',
		]) {
			writeFileSync(bad, body);
			expect(readEntry(bad, 0)).toBeUndefined();
		}
	});

	test('a failed write cleans its temporary file', () => {
		const blocked = join(root, 'blocked');
		writeFileSync(blocked, 'a file where a directory is needed');
		expect(() => writeEntry(join(blocked, 'x.json'), 1, 0)).toThrow();
		expect(readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual(
			[],
		);
	});
});

describe('describeAge', () => {
	test.each([
		[0, 'as of under a minute ago'],
		[59_000, 'as of under a minute ago'],
		[4 * 60_000 + 10, 'as of 4m ago'],
		[59 * 60_000, 'as of 59m ago'],
		[3 * 3_600_000, 'as of 3h ago'],
	])('%p -> %p', (ms, text) => {
		expect(describeAge(ms)).toBe(text);
	});
});
