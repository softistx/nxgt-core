import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	allowedOwners,
	formatRepo,
	gitConfigPath,
	isAllowedOwner,
	originUrlFromConfig,
	parseRemote,
	parseRepositoryField,
	repoOfDirectory,
	sameRepo,
} from './repo-id';

const soft = { owner: 'softistx', repo: 'nxgt-core' };

describe('parseRemote', () => {
	test.each([
		'https://github.com/softistx/nxgt-core.git',
		'https://github.com/softistx/nxgt-core',
		'https://github.com/softistx/nxgt-core/',
		'https://x-access-token:abc@github.com/softistx/nxgt-core.git',
		'https://www.github.com/softistx/nxgt-core',
		'git@github.com:softistx/nxgt-core.git',
		'git@github.com:softistx/nxgt-core',
		'ssh://git@github.com/softistx/nxgt-core.git',
		'ssh://git@github.com:22/softistx/nxgt-core.git',
		'git+https://github.com/softistx/nxgt-core.git',
		'git://github.com/softistx/nxgt-core.git',
		'  https://github.com/softistx/nxgt-core.git\n',
	])('reads %p', (url) => {
		expect(parseRemote(url)).toEqual(soft);
	});

	test.each([
		'https://gitlab.com/softistx/nxgt-core.git',
		'https://github.com/softistx',
		'https://github.com/softistx/nxgt-core/tree/main',
		'/some/local/path',
		'../sibling',
		'',
		'https://evilgithub.com/softistx/nxgt-core',
		'https://github.com.evil.io/softistx/nxgt-core',
	])('rejects %p', (url) => {
		expect(parseRemote(url)).toBeUndefined();
	});

	test('keeps dots and dashes in names', () => {
		expect(parseRemote('git@github.com:SteveGT96/csso.api-v2.git')).toEqual({
			owner: 'SteveGT96',
			repo: 'csso.api-v2',
		});
	});
});

describe('parseRepositoryField', () => {
	test('a string URL', () => {
		expect(
			parseRepositoryField('git+https://github.com/softistx/nxgt-core.git'),
		).toEqual(soft);
	});

	test('an object with url and directory', () => {
		expect(
			parseRepositoryField({
				type: 'git',
				url: 'git+https://github.com/softistx/nxgt-core.git',
				directory: 'packages/x',
			}),
		).toEqual(soft);
	});

	test('github: and bare shorthands', () => {
		expect(parseRepositoryField('github:softistx/nxgt-core')).toEqual(soft);
		expect(parseRepositoryField('softistx/nxgt-core')).toEqual(soft);
	});

	test.each([
		undefined,
		null,
		5,
		{},
		{ url: 5 },
		'',
		'gitlab:a/b',
		'https://example.com/a/b',
	])('gives up on %p', (field) => {
		expect(parseRepositoryField(field)).toBeUndefined();
	});
});

describe('owners', () => {
	test('default list', () => {
		expect(allowedOwners({})).toEqual(['softistx', 'SteveGT96']);
		expect(allowedOwners({ NXGT_ISSUES_OWNERS: ' , ' })).toEqual([
			'softistx',
			'SteveGT96',
		]);
	});

	test('NXGT_ISSUES_OWNERS overrides, trimmed', () => {
		expect(allowedOwners({ NXGT_ISSUES_OWNERS: 'a, b ,c' })).toEqual([
			'a',
			'b',
			'c',
		]);
	});

	test('comparison ignores case', () => {
		const owners = allowedOwners({});
		expect(isAllowedOwner('stevegt96', owners)).toBe(true);
		expect(isAllowedOwner('SOFTISTX', owners)).toBe(true);
		expect(isAllowedOwner('someone-else', owners)).toBe(false);
	});

	test('sameRepo and formatRepo', () => {
		expect(sameRepo(soft, { owner: 'SoftistX', repo: 'NXGT-core' })).toBe(true);
		expect(sameRepo(soft, { owner: 'softistx', repo: 'other' })).toBe(false);
		expect(formatRepo(soft)).toBe('softistx/nxgt-core');
	});
});

describe('originUrlFromConfig', () => {
	test('finds origin among other remotes and sections', () => {
		const config = [
			'[core]',
			'\tbare = false',
			'[remote "upstream"]',
			'\turl = https://github.com/other/fork.git',
			'[remote "origin"]',
			'\turl = git@github.com:softistx/nxgt-core.git',
			'\tfetch = +refs/heads/*:refs/remotes/origin/*',
			'[branch "develop"]',
			'\turl = not-this',
		].join('\n');
		expect(originUrlFromConfig(config)).toBe(
			'git@github.com:softistx/nxgt-core.git',
		);
	});

	test('undefined without an origin', () => {
		expect(
			originUrlFromConfig('[remote "upstream"]\n\turl = x'),
		).toBeUndefined();
		expect(originUrlFromConfig('')).toBeUndefined();
	});

	test('tolerates CRLF', () => {
		expect(originUrlFromConfig('[remote "origin"]\r\n\turl = u\r\n')).toBe('u');
	});
});

describe('repoOfDirectory', () => {
	const root = mkdtempSync(join(tmpdir(), 'nxgt-issues-repo-'));
	afterAll(() => rmSync(root, { recursive: true, force: true }));
	const origin = (url: string) => `[remote "origin"]\n\turl = ${url}\n`;

	test('a plain checkout, from a nested directory', () => {
		const repo = join(root, 'plain');
		mkdirSync(join(repo, '.git'), { recursive: true });
		mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
		writeFileSync(
			join(repo, '.git', 'config'),
			origin('git@github.com:softistx/nxgt-core.git'),
		);
		expect(repoOfDirectory(repo)).toEqual(soft);
		expect(repoOfDirectory(join(repo, 'src', 'deep'))).toEqual(soft);
	});

	test('a linked worktree follows .git file -> gitdir -> commondir', () => {
		const main = join(root, 'main');
		const gitDir = join(main, '.git', 'worktrees', 'wt');
		mkdirSync(gitDir, { recursive: true });
		writeFileSync(
			join(main, '.git', 'config'),
			origin('https://github.com/SteveGT96/app.git'),
		);
		writeFileSync(join(gitDir, 'commondir'), '../..\n');
		const worktree = join(root, 'worktrees', 'wt');
		mkdirSync(worktree, { recursive: true });
		writeFileSync(join(worktree, '.git'), `gitdir: ${gitDir}\n`);
		expect(repoOfDirectory(worktree)).toEqual({
			owner: 'SteveGT96',
			repo: 'app',
		});
		expect(gitConfigPath(worktree)).toBe(join(main, '.git', 'config'));
	});

	test('a relative gitdir (a submodule-style .git file)', () => {
		const outer = join(root, 'rel');
		mkdirSync(join(outer, 'store'), { recursive: true });
		mkdirSync(join(outer, 'checkout'), { recursive: true });
		writeFileSync(
			join(outer, 'store', 'config'),
			origin('https://github.com/softistx/rel.git'),
		);
		writeFileSync(join(outer, 'checkout', '.git'), 'gitdir: ../store\n');
		expect(repoOfDirectory(join(outer, 'checkout'))).toEqual({
			owner: 'softistx',
			repo: 'rel',
		});
	});

	test('undefined without a repository, an origin, or with a broken .git file', () => {
		const bare = join(root, 'no-git');
		mkdirSync(bare, { recursive: true });
		expect(repoOfDirectory(bare)).toBeUndefined();

		const noOrigin = join(root, 'no-origin');
		mkdirSync(join(noOrigin, '.git'), { recursive: true });
		writeFileSync(join(noOrigin, '.git', 'config'), '[core]\n');
		expect(repoOfDirectory(noOrigin)).toBeUndefined();

		const broken = join(root, 'broken');
		mkdirSync(broken, { recursive: true });
		writeFileSync(join(broken, '.git'), 'garbage');
		expect(repoOfDirectory(broken)).toBeUndefined();

		const dangling = join(root, 'dangling');
		mkdirSync(dangling, { recursive: true });
		writeFileSync(join(dangling, '.git'), `gitdir: ${join(root, 'missing')}\n`);
		expect(repoOfDirectory(dangling)).toBeUndefined();
	});

	test('a non-GitHub origin is not a repository', () => {
		const repo = join(root, 'gitlab');
		mkdirSync(join(repo, '.git'), { recursive: true });
		writeFileSync(
			join(repo, '.git', 'config'),
			origin('https://gitlab.com/a/b.git'),
		);
		expect(repoOfDirectory(repo)).toBeUndefined();
	});
});
