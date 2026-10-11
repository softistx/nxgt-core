import { afterAll, describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	readdirSync,
	statSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
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

describe('stamp folder cleanup', () => {
	const folder = (h: string) => dirname(stampPath(h, ME, 'refreshing'));
	const age = (path: string, seconds: number) => {
		const old = new Date(Date.now() - seconds * 1000);
		utimesSync(path, old, old);
	};

	test('a takeover keeps its own generation marker and drops the others and old temporaries', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW - 120_000);
		const base = stampPath(h, ME, 'refreshing');
		writeFileSync(`${base}.takeover.1`, '');
		writeFileSync(`${base}.abc.tmp`, '');
		age(`${base}.abc.tmp`, 11);
		writeFileSync(`${base}.young.tmp`, '');
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(true);
		expect(readdirSync(folder(h)).sort()).toEqual(
			[
				basename(base),
				`${basename(base)}.takeover.${NOW - 120_000}`,
				`${basename(base)}.young.tmp`,
			].sort(),
		);
	});

	test('clearStamps drops every marker and the old temporaries', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW);
		const base = stampPath(h, ME, 'refreshing');
		writeFileSync(`${base}.takeover.7`, '');
		writeFileSync(`${base}.old.tmp`, '');
		age(`${base}.old.tmp`, 11);
		clearStamps(h, ME);
		expect(readdirSync(folder(h))).toEqual([]);
	});
});

describe('claimStamp: processes racing for an expired stamp', () => {
	test('exactly one of eight wins', async () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW - 120_000);
		const start = Date.now() + 1500;
		const script = `
			import { claimStamp } from ${JSON.stringify(join(import.meta.dir, 'refresh-state'))};
			while (Date.now() < ${start}) {}
			console.log(claimStamp(${JSON.stringify(h)}, { owner: 'softistx', repo: 'nxgt-zorblax' }, 'refreshing', ${NOW}));`;
		const children = Array.from({ length: 8 }, () =>
			Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' }),
		);
		const answers = await Promise.all(
			children.map(async (child) =>
				(await new Response(child.stdout).text()).trim(),
			),
		);
		expect(answers.filter((a) => a === 'true')).toHaveLength(1);
		expect(answers.filter((a) => a === 'false')).toHaveLength(7);
	});

	test('an abandoned marker (11 s old): exactly one of eight wins, round after round', async () => {
		const rounds = await Promise.all(
			Array.from({ length: 10 }, async () => {
				const h = home();
				claimStamp(h, ME, 'refreshing', NOW - 120_000);
				const marker = `${stampPath(h, ME, 'refreshing')}.takeover.${NOW - 120_000}`;
				writeFileSync(marker, '');
				const old = new Date(Date.now() - 11_000);
				utimesSync(marker, old, old);
				const start = Date.now() + 2000;
				const script = `
					import { claimStamp } from ${JSON.stringify(join(import.meta.dir, 'refresh-state'))};
					while (Date.now() < ${start}) {}
					console.log(claimStamp(${JSON.stringify(h)}, { owner: 'softistx', repo: 'nxgt-zorblax' }, 'refreshing', ${NOW}));`;
				const children = Array.from({ length: 8 }, () =>
					Bun.spawn(['bun', '-e', script], { stdout: 'pipe', stderr: 'pipe' }),
				);
				return Promise.all(
					children.map(async (child) =>
						(await new Response(child.stdout).text()).trim(),
					),
				);
			}),
		);
		for (const answers of rounds) {
			expect(answers.filter((a) => a === 'true')).toHaveLength(1);
		}
	});

	test('a claim after the takeover finds the new stamp taken', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW - 120_000);
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(true);
		expect(claimStamp(h, ME, 'refreshing', NOW)).toBe(false);
		expect(claimStamp(h, ME, 'refreshing', NOW + 1)).toBe(false);
	});

	test('takeover markers are cleared with the stamps', () => {
		const h = home();
		claimStamp(h, ME, 'refreshing', NOW - 120_000);
		claimStamp(h, ME, 'refreshing', NOW);
		clearStamps(h, ME);
		expect(readdirSync(dirname(stampPath(h, ME, 'refreshing')))).toEqual([]);
	});
});
