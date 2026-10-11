import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
	claimStamp,
	clearStamps,
	setStamp,
	stampFresh,
	stampPath,
} from './refresh-state';
import { home, ME, NOW, removeTempDirs } from './session.fixtures';

afterAll(removeTempDirs);

describe('claimStamp', () => {
	test('the first claim takes the stamp, the second finds it taken', () => {
		const h = home();
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(true);
		expect(claimStamp(h, ME, 'refreshing', NOW + 1000)).toBe(false);
		expect(stampFresh(h, ME, 'refreshing', NOW + 1000)).toBe(true);
	});

	test('concurrent claims: exactly one wins', async () => {
		const h = home();
		const results = await Promise.all(
			Array.from({ length: 16 }, async () =>
				claimStamp(h, ME, 'refreshing', NOW),
			),
		);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	test('an expired stamp is taken over, once', () => {
		const h = home();
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(true);
		const later = NOW + 61_000;
		expect(claimStamp(h, ME, 'refreshing', later)).toBe(true);
		expect(claimStamp(h, ME, 'refreshing', later)).toBe(false);
	});

	test('a stamp file that exists but is still empty counts as taken', () => {
		const h = home();
		const path = stampPath(h, ME, 'refreshing');
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, '');
		expect(claimStamp(h, ME, 'refreshing', Date.now())).toBe(false);
	});

	test('an unwritable home is not a claim, and not an error', () => {
		const h = home();
		writeFileSync(`${h}/cache`, 'a file where the folder should be');
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(false);
	});

	test('clearStamps lets the next claim through', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW);
		clearStamps(h, ME);
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(true);
	});

	test('a stamp is private to its owner', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW);
		setStamp(h, ME, 'failed', NOW);
		for (const kind of ['refreshing', 'failed'] as const) {
			const path = stampPath(h, ME, kind);
			expect(statSync(path).mode & 0o777).toBe(0o600);
			expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
		}
	});
});
