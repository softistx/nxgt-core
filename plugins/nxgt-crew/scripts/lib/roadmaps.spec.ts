/**
 * The roadmap reader against real folders: a temporary worktree per case,
 * removed afterwards by its variable.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readRoadmaps, repoScope } from './roadmaps';

let scratch: string;
let wt: string;

beforeAll(async () => {
	scratch = mkdtempSync(join(tmpdir(), 'nxgt-crew-roadmaps-'));
	wt = join(scratch, 'wt');
	mkdirSync(join(wt, 'docs'), { recursive: true });
	mkdirSync(join(wt, 'packages', 'mail', 'docs'), { recursive: true });
	mkdirSync(join(wt, 'packages', 'bare', 'docs'), { recursive: true });
	writeFileSync(
		join(wt, 'docs', 'roadmap.md'),
		'## Next\n\n- **Root entry**\n',
	);
	writeFileSync(
		join(wt, 'packages', 'mail', 'package.json'),
		JSON.stringify({ name: '@nxgt/mail' }),
	);
	writeFileSync(
		join(wt, 'packages', 'mail', 'docs', 'roadmap.md'),
		'## Now\n\n- **Transport**\n',
	);
	writeFileSync(
		join(wt, 'packages', 'bare', 'docs', 'roadmap.md'),
		'## Later\n\n- Bare entry — no manifest\n',
	);
	await $`git init -q ${wt}`.quiet();
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

const byScope = (list: ReturnType<typeof readRoadmaps>) =>
	Object.fromEntries(list.map((r) => [r.scope, r.entries.map((e) => e.title)]));

describe('readRoadmaps', () => {
	test('the root roadmap takes the repository name from the given remote, not the folder', () => {
		const list = readRoadmaps(wt, 'git@github.com:softistx/nxgt-mail.git');
		expect(byScope(list)).toEqual({
			'nxgt-mail': ['Root entry'],
			'@nxgt/mail': ['Transport'],
			bare: ['Bare entry'],
		});
	});

	test('without a given remote, it reads the worktree’s origin', async () => {
		await $`git -C ${wt} remote add origin https://github.com/softistx/nxgt-janus`.quiet();
		expect(repoScope(wt)).toBe('nxgt-janus');
		expect(
			readRoadmaps(wt).find((r) =>
				r.path.endsWith(join('wt', 'docs', 'roadmap.md')),
			)?.scope,
		).toBe('nxgt-janus');
		await $`git -C ${wt} remote remove origin`.quiet();
	});

	test('with no remote at all, the folder name is the last resort', () => {
		expect(repoScope(wt)).toBe('wt');
	});

	test('a package roadmap takes its manifest name, else its folder', () => {
		const list = readRoadmaps(wt, 'x/nxgt-mail');
		expect(
			list.find((r) => r.path.includes(join('packages', 'mail')))?.scope,
		).toBe('@nxgt/mail');
		expect(
			list.find((r) => r.path.includes(join('packages', 'bare')))?.scope,
		).toBe('bare');
	});

	test('a missing worktree has no roadmaps', () => {
		expect(readRoadmaps(join(scratch, 'gone'))).toEqual([]);
	});
});
