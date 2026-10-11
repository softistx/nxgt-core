/**
 * The git the plugin runs reads a directory it does not control. A repository's
 * own `.git/config` can name a command (`core.fsmonitor`, `gpg.program`,
 * `diff.external`, a textconv driver); each spec plants one that writes a marker
 * file, runs the real runner and asserts the marker never appears. A baseline
 * per key proves the plant fires with raw git on this machine; a guarded spec
 * is skipped, not passed vacuously, when it does not.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { type GhContext, gh } from './github';
import { MARKER_GREP_ARGV, markerGrepArgv, parseMarkers } from './markers';
import {
	addedChangesetPackages,
	commitTouches,
	loggedPrs,
} from './release-git';
import {
	childEnv,
	createRunner,
	GIT_GUARD,
	hardenGit,
	type RunOptions,
} from './runner';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const runner = createRunner({ NXGT_ISSUES_ALLOW_NETWORK: '1' });
const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

async function raw(
	argv: string[],
	cwd: string,
): Promise<{ code: number; stdout: string }> {
	const child = Bun.spawn(argv, { cwd, stdout: 'pipe', stderr: 'pipe' });
	const stdout = await new Response(child.stdout).text();
	await new Response(child.stderr).text();
	return { code: await child.exited, stdout };
}

const git = async (cwd: string, ...args: string[]) => {
	const r = await raw(['git', ...IDENTITY, ...args], cwd);
	if (r.code !== 0) throw new Error(`git ${args.join(' ')} failed`);
	return r.stdout.trim();
};

/** A script that writes `marker` when run, whatever its arguments. */
function plant(
	dir: string,
	name = 'plant',
): { script: string; marker: string } {
	const marker = join(dir, `${name}.marker`);
	const script = join(dir, `${name}.sh`);
	writeFileSync(script, `#!/bin/sh\necho ran > '${marker}'\nexit 1\n`);
	chmodSync(script, 0o755);
	return { script, marker };
}

/** A repository with two commits touching `packages/zorblax` and a `Temporary, until acme#1` line. */
async function makeRepo(): Promise<string> {
	const dir = tempDir('guard-repo');
	await git(dir, 'init', '-q', '-b', 'main');
	mkdirSync(join(dir, 'packages/zorblax'), { recursive: true });
	writeFileSync(join(dir, 'a.txt'), 'one\n');
	writeFileSync(
		join(dir, 'packages/zorblax/x.ts'),
		'// Temporary, until acme#1\n',
	);
	await git(dir, 'add', '.');
	await git(dir, 'commit', '-q', '-m', 'first');
	await git(dir, 'tag', '@nxgt/zorblax@1.0.0');
	writeFileSync(join(dir, 'a.txt'), 'two\n');
	await git(dir, 'add', '.');
	await git(dir, 'commit', '-q', '-m', 'Merge pull request #5 from acme/x');
	return dir;
}

const plantConfig = async (dir: string, key: string, value: string) => {
	await git(dir, 'config', key, value);
};

// Baselines: does the planted key run a command under raw git here?
async function fires(
	setup: (dir: string, script: string) => Promise<void>,
	argv: string[],
): Promise<boolean> {
	const dir = await makeRepo();
	const { script, marker } = plant(tempDir('guard-base'));
	await setup(dir, script);
	await raw(['git', ...argv], dir);
	return existsSync(marker);
}

const fsmonitor = await fires(
	(dir, script) => plantConfig(dir, 'core.fsmonitor', script),
	['grep', '-n', 'Temporary'],
);
const gpg = await fires(
	async (dir, script) => {
		await signHead(dir);
		await plantConfig(dir, 'log.showSignature', 'true');
		await plantConfig(dir, 'gpg.program', script);
	},
	['log', '-1'],
);
const external = await fires(
	(dir, script) => plantConfig(dir, 'diff.external', script),
	['diff', 'HEAD~1', 'HEAD'],
);
const textconv = await fires(
	async (dir, script) => {
		await plantTextconv(dir, script);
	},
	['diff', 'HEAD~1', 'HEAD'],
);

async function plantTextconv(dir: string, script: string): Promise<void> {
	appendFileSync(join(dir, '.git/info/attributes'), '*.txt diff=up\n');
	await plantConfig(dir, 'diff.up.textconv', script);
}

/** Rewrites HEAD as the same commit with a fake `gpgsig` header. */
async function signHead(dir: string): Promise<void> {
	const body = await git(dir, 'cat-file', 'commit', 'HEAD');
	const signed = body.replace(
		/^(committer .*)$/m,
		'$1\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n fake\n -----END PGP SIGNATURE-----',
	);
	const sha = await new Promise<string>((resolve, reject) => {
		const child = Bun.spawn(
			['git', 'hash-object', '-t', 'commit', '-w', '--stdin', '--literally'],
			{ cwd: dir, stdin: 'pipe', stdout: 'pipe' },
		);
		child.stdin.write(`${signed}\n`);
		void child.stdin.end();
		new Response(child.stdout).text().then((t) => resolve(t.trim()), reject);
	});
	await git(dir, 'update-ref', 'HEAD', sha);
}

const guarded = (baseline: boolean) => (baseline ? test : test.skip);

describe('baselines on this machine', () => {
	test('which planted keys fire under raw git', () => {
		console.log(
			`git-guard baselines: fsmonitor=${fsmonitor} gpg=${gpg} diff.external=${external} textconv=${textconv}`,
		);
		expect(typeof fsmonitor).toBe('boolean');
	});
});

describe('the runner keeps a repository config from running a command', () => {
	guarded(fsmonitor)(
		'the markers grep: no marker, the line is found',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant(tempDir('guard-plant'));
			await plantConfig(dir, 'core.fsmonitor', script);
			const result = await runner.run(markerGrepArgv([]), { cwd: dir });
			expect(existsSync(marker)).toBe(false);
			expect(result.code).toBe(0);
			expect(parseMarkers(result.stdout).map((m) => m.number)).toEqual([1]);
		},
	);

	guarded(fsmonitor)('track findMarkers grep: no marker', async () => {
		const dir = await makeRepo();
		const { script, marker } = plant(tempDir('guard-plant'));
		await plantConfig(dir, 'core.fsmonitor', script);
		const result = await runner.run([...MARKER_GREP_ARGV], { cwd: dir });
		expect(existsSync(marker)).toBe(false);
		expect(result.stdout).toContain('Temporary, until acme#1');
	});

	guarded(gpg)(
		'the release log: no marker, the PR numbers are returned',
		async () => {
			const dir = await makeRepo();
			await signHead(dir);
			await git(dir, 'tag', '@nxgt/zorblax@1.0.1');
			await git(dir, 'checkout', '-q', '--detach', '@nxgt/zorblax@1.0.1');
			const { script, marker } = plant(tempDir('guard-plant'));
			await plantConfig(dir, 'log.showSignature', 'true');
			await plantConfig(dir, 'gpg.program', script);
			const ctx: GhContext = { runner, home: dir, now: Date.now, cwd: dir };
			const input = {
				repo: { owner: 'acme', repo: 'zorblax' },
				pkg: '@nxgt/zorblax',
				version: '1.0.1',
				dir: '.',
			};
			const notes: string[] = [];
			const found = await loggedPrs(ctx, input, notes);
			expect(existsSync(marker)).toBe(false);
			expect(found.prs).toEqual([5]);
		},
	);

	guarded(external)(
		'diff and show with an external diff driver: no marker',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant(tempDir('guard-plant'));
			await plantConfig(dir, 'diff.external', script);
			await runner.run(['git', 'diff', 'HEAD~1', 'HEAD'], { cwd: dir });
			await runner.run(['git', 'show', 'HEAD'], { cwd: dir });
			expect(existsSync(marker)).toBe(false);
		},
	);

	// A textconv driver has a name of the repository's choosing, so no `-c` can
	// list it: the release call sites carry `--no-textconv` themselves.
	guarded(textconv)(
		'the release diff and show with a textconv driver: no marker',
		async () => {
			const dir = await makeRepo();
			mkdirSync(join(dir, '.changeset'));
			writeFileSync(
				join(dir, '.changeset/c.md'),
				'---\n"@nxgt/zorblax": patch\n---\n\nFix.\n',
			);
			await git(dir, 'add', '.');
			await git(dir, 'commit', '-q', '-m', 'add a changeset');
			const { script, marker } = plant(tempDir('guard-plant'));
			appendFileSync(join(dir, '.git/info/attributes'), '*.md diff=up\n');
			await plantConfig(dir, 'diff.up.textconv', script);
			const ctx: GhContext = { runner, home: dir, now: Date.now, cwd: dir };
			expect(await addedChangesetPackages(ctx, 'HEAD')).toEqual([
				'@nxgt/zorblax',
			]);
			expect(existsSync(marker)).toBe(false);
		},
	);

	test('the release call sites pass the second layer of flags', async () => {
		const calls: string[][] = [];
		const spy = {
			async run(argv: readonly string[]) {
				calls.push([...argv]);
				return { code: 0, stdout: '', stderr: '' };
			},
			async fetchJson() {
				return {};
			},
		};
		const ctx: GhContext = { runner: spy, home: '/h', now: Date.now };
		await commitTouches(ctx, 'abc', 'packages/zorblax');
		expect(calls[0]).toEqual(
			expect.arrayContaining(['diff', '--no-ext-diff', '--no-textconv']),
		);
	});

	guarded(fsmonitor)(
		'a .git file pointing at another gitdir with the plant: no marker',
		async () => {
			const real = await makeRepo();
			const { script, marker } = plant(tempDir('guard-plant'));
			await plantConfig(real, 'core.fsmonitor', script);
			const link = tempDir('guard-link');
			writeFileSync(join(link, '.git'), `gitdir: ${join(real, '.git')}\n`);
			writeFileSync(join(link, 'b.ts'), '// Temporary, until acme#1\n');
			const result = await runner.run(markerGrepArgv([]), { cwd: link });
			expect(existsSync(marker)).toBe(false);
			expect(result.code).toBeLessThan(2);
		},
	);

	test('GIT_DIR in the parent env does not change which repository is read', async () => {
		const mine = await makeRepo();
		const other = tempDir('guard-other');
		await git(other, 'init', '-q', '-b', 'main');
		writeFileSync(join(other, 'o.txt'), 'x\n');
		await git(other, 'add', '.');
		await git(other, 'commit', '-q', '-m', 'only other');
		const before = process.env['GIT_DIR'];
		process.env['GIT_DIR'] = join(other, '.git');
		try {
			const result = await runner.run(['git', 'log', '--format=%s'], {
				cwd: mine,
			});
			expect(result.stdout).toContain('Merge pull request #5');
			expect(result.stdout).not.toContain('only other');
		} finally {
			if (before === undefined) delete process.env['GIT_DIR'];
			else process.env['GIT_DIR'] = before;
		}
	});

	test('git config --get still reads the global config', async () => {
		const home = tempDir('guard-home');
		const cfg = join(home, 'gitconfig');
		writeFileSync(cfg, '[user]\n\tname = zorblax\n');
		const before = process.env['GIT_CONFIG_GLOBAL'];
		process.env['GIT_CONFIG_GLOBAL'] = cfg;
		try {
			const result = await runner.run(['git', 'config', '--get', 'user.name'], {
				cwd: home,
			});
			expect(result.stdout.trim()).toBe('zorblax');
		} finally {
			if (before === undefined) delete process.env['GIT_CONFIG_GLOBAL'];
			else process.env['GIT_CONFIG_GLOBAL'] = before;
		}
	});
});

describe('hardenGit', () => {
	test('leaves a command that is not git alone', () => {
		expect(hardenGit(['gh', 'api', 'x'])).toEqual(['gh', 'api', 'x']);
		expect(hardenGit(['sh', '-c', 'git status'])).toEqual([
			'sh',
			'-c',
			'git status',
		]);
	});

	test('puts the guard before the subcommand, once', () => {
		const out = hardenGit(['git', 'grep', '-n', 'x']);
		expect(out.slice(0, 1 + GIT_GUARD.length)).toEqual(['git', ...GIT_GUARD]);
		expect(out.slice(1 + GIT_GUARD.length)).toEqual(['grep', '-n', 'x']);
		expect(out.filter((a) => a === 'core.fsmonitor=false')).toHaveLength(1);
	});

	test('names the keys that can run a command', () => {
		expect(GIT_GUARD).toContain('core.fsmonitor=false');
		expect(GIT_GUARD).toContain('log.showSignature=false');
		expect(GIT_GUARD).toContain('--no-optional-locks');
	});
});

describe('childEnv', () => {
	test('drops what redirects git and keeps the rest', () => {
		const out = childEnv({
			GIT_DIR: '/x',
			GIT_WORK_TREE: '/x',
			GIT_INDEX_FILE: '/x',
			GIT_COMMON_DIR: '/x',
			GIT_OBJECT_DIRECTORY: '/x',
			GIT_EXTERNAL_DIFF: '/x',
			GIT_CONFIG_PARAMETERS: "'a=b'",
			GIT_CONFIG_COUNT: '1',
			GIT_CONFIG_KEY_0: 'core.fsmonitor',
			GIT_CONFIG_VALUE_0: '/x',
			GIT_CONFIG_GLOBAL: '/g',
			GIT_CONFIG_NOSYSTEM: '1',
			PATH: '/bin',
			HOME: '/h',
			GIT_PAGER: 'less',
			UNSET: undefined,
		});
		expect(Object.keys(out).sort()).toEqual(
			[
				'GH_PROMPT_DISABLED',
				'GIT_CONFIG_GLOBAL',
				'GIT_CONFIG_NOSYSTEM',
				'GIT_OPTIONAL_LOCKS',
				'GIT_PAGER',
				'GIT_TERMINAL_PROMPT',
				'HOME',
				'PATH',
			].sort(),
		);
		expect(out['GIT_PAGER']).toBe('cat');
		expect(out['GIT_TERMINAL_PROMPT']).toBe('0');
		expect(out['GIT_OPTIONAL_LOCKS']).toBe('0');
		expect(out['GH_PROMPT_DISABLED']).toBe('1');
	});
});

describe('gh', () => {
	test('is never run in the untrusted working directory', async () => {
		const seen: (RunOptions | undefined)[] = [];
		const spy = {
			async run(_argv: readonly string[], options?: RunOptions) {
				seen.push(options);
				return { code: 0, stdout: '{}', stderr: '' };
			},
			async fetchJson() {
				return {};
			},
		};
		const untrusted = tempDir('guard-untrusted');
		const home = tempDir('guard-ghhome');
		await gh({ runner: spy, home, now: Date.now, cwd: untrusted }, [
			'api',
			'x',
		]);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.cwd).not.toBe(untrusted);
	});
});
