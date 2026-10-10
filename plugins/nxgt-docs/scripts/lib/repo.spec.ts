import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { gitArgv, parseStatus, repositoriesToCheck } from './repo';

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

describe('repositoriesToCheck', () => {
	const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'nxgt-docs-repo-')));
	afterAll(() => rmSync(scratch, { recursive: true, force: true }));

	async function repo(name: string) {
		const path = join(scratch, name);
		mkdirSync(join(path, 'src'), { recursive: true });
		await $`git init -q ${path}`.quiet();
		return path;
	}

	test('the cwd repository first, then edited ones; outside paths skipped; capped', async () => {
		const [a, b, c] = [await repo('a'), await repo('b'), await repo('c')];
		const loose = join(scratch, 'loose');
		mkdirSync(loose);
		const edited = [
			join(b, 'src/x.ts'),
			join(loose, 'n.ts'),
			join(b, 'gone/deep/y.ts'),
			join(c, 'z.ts'),
			join(a, 'src/a.ts'),
		];
		expect(repositoriesToCheck(join(a, 'src'), edited)).toEqual([a, b, c]);
		expect(repositoriesToCheck(loose, edited, 2)).toEqual([b, c]);
		expect(repositoriesToCheck(loose, [join(loose, 'n.ts')])).toEqual([]);
	});

	test('a relative path resolves against cwd; the directory budget caps the git calls', async () => {
		const [d, e] = [await repo('d'), await repo('e')];
		expect(repositoriesToCheck(scratch, ['d/src/x.ts', 'e/y.ts'])).toEqual([
			d,
			e,
		]);
		expect(
			repositoriesToCheck(
				scratch,
				[join(d, 'src/x.ts'), join(e, 'y.ts')],
				10,
				1,
			),
		).toEqual([d]);
		expect(
			repositoriesToCheck(scratch, ['/no-such-top/deep/a.ts', join(e, 'y.ts')]),
		).toEqual([e]);
	});
});
