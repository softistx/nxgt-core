/**
 * The git the plugin runs reads a directory it does not control. A repository's
 * own `.git/config` can name a command (`core.fsmonitor`, `gpg.program`,
 * `diff.external`, a promisor remote's `uploadpack`); each spec plants one that
 * writes a marker file, runs the real runner (or one with a single part of the
 * guard) and asserts the marker never appears. A baseline per key proves the
 * plant fires under raw git on this machine; a guarded spec is skipped, not
 * passed vacuously, when it does not (and fails in CI when none fires at all).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { CliContext } from './cli-context';
import { childEnv, GIT_GUARD, hardenGit } from './git-guard';
import { type GhContext, gh } from './github';
import { MARKER_GREP_ARGV, markerGrepArgv, parseMarkers } from './markers';
import {
	addedChangesetPackages,
	commitTouches,
	hasTags,
	isAncestor,
	loggedPrs,
	previousTag,
} from './release-git';
import { discoverFixes } from './release-prs';
import {
	createRunner,
	type Runner,
	type RunOptions,
	type RunResult,
} from './runner';
import { removeTempDirs, tempDir } from './temp.fixtures';
import { findMarkers } from './track';

afterAll(removeTempDirs);

const runner = createRunner({ NXGT_ISSUES_ALLOW_NETWORK: '1' });
const IDENTITY = ['-c', 'user.name=t', '-c', 'user.email=t@t'];

async function spawn(
	argv: readonly string[],
	cwd: string,
	env?: Record<string, string>,
): Promise<RunResult> {
	const child = Bun.spawn([...argv], {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		...(env ? { env } : {}),
	});
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { code: await child.exited, stdout, stderr };
}

/** A runner with only the named parts of the guard, to prove each part alone. */
function partial(parts: { harden: boolean; env: boolean }): Runner {
	return {
		run: (argv, options?: RunOptions) =>
			spawn(
				parts.harden ? hardenGit(argv) : argv,
				options?.cwd ?? process.cwd(),
				parts.env ? childEnv(process.env) : undefined,
			),
		fetchJson: async () => ({}),
	};
}
const onlyGuard = partial({ harden: true, env: false });
const onlyEnv = partial({ harden: false, env: true });
const bare = partial({ harden: false, env: false });

const git = async (cwd: string, ...args: string[]) => {
	const r = await spawn(['git', ...IDENTITY, ...args], cwd);
	if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
	return r.stdout.trim();
};
const plantConfig = async (dir: string, key: string, value: string) => {
	await git(dir, 'config', key, value);
};

/** A script that writes `marker` when run, whatever its arguments. */
function plant(name = 'plant'): { script: string; marker: string } {
	const dir = tempDir('guard-plant');
	const marker = join(dir, `${name}.marker`);
	const script = join(dir, `${name}.sh`);
	writeFileSync(script, `#!/bin/sh\necho ran >> '${marker}'\nexit 1\n`);
	chmodSync(script, 0o755);
	return { script, marker };
}

const CHANGESET = '---\n"@nxgt/zorblax": patch\n---\n\nFix.\n';

/** Two commits touching `packages/zorblax`, the second adding a changeset; tagged 1.0.0 on the first. */
async function makeRepo(): Promise<string> {
	const dir = tempDir('guard-repo');
	await git(dir, 'init', '-q', '-b', 'main');
	mkdirSync(join(dir, 'packages/zorblax'), { recursive: true });
	writeFileSync(join(dir, 'a.txt'), 'one\n');
	writeFileSync(
		join(dir, 'packages/zorblax/x.ts'),
		'// Temporary, until acme#1\n// Temporary, until @nxgt/zorblax#1\n',
	);
	await git(dir, 'add', '.');
	await git(dir, 'commit', '-q', '-m', 'first');
	await git(dir, 'tag', '@nxgt/zorblax@1.0.0');
	writeFileSync(join(dir, 'a.txt'), 'two\n');
	mkdirSync(join(dir, '.changeset'));
	writeFileSync(join(dir, '.changeset/c.md'), CHANGESET);
	await git(dir, 'add', '.');
	await git(dir, 'commit', '-q', '-m', 'Merge pull request #5 from acme/x');
	return dir;
}

/** Rewrites HEAD as the same commit with a fake `gpgsig` header. */
async function signHead(dir: string): Promise<void> {
	const body = await git(dir, 'cat-file', 'commit', 'HEAD');
	const signed = body.replace(
		/^(committer .*)$/m,
		'$1\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n fake\n -----END PGP SIGNATURE-----',
	);
	const child = Bun.spawn(
		['git', 'hash-object', '-t', 'commit', '-w', '--stdin', '--literally'],
		{ cwd: dir, stdin: 'pipe', stdout: 'pipe' },
	);
	child.stdin.write(`${signed}\n`);
	await child.stdin.end();
	const sha = (await new Response(child.stdout).text()).trim();
	await git(dir, 'update-ref', 'HEAD', sha);
}

/** HEAD is signed and tagged 1.0.1; the repository runs `script` for a signature check. */
async function plantSignature(dir: string, script: string): Promise<void> {
	await signHead(dir);
	await git(dir, 'tag', '@nxgt/zorblax@1.0.1');
	await plantConfig(dir, 'log.showSignature', 'true');
	await plantConfig(dir, 'gpg.program', script);
}

/** A partial clone whose missing blob (the changeset) is lazily fetched through `script`. */
async function plantPromisor(dir: string, script: string): Promise<void> {
	const source = await makeRepo();
	await plantConfig(dir, 'core.repositoryformatversion', '1');
	await plantConfig(dir, 'extensions.partialClone', 'origin');
	await plantConfig(dir, 'remote.origin.promisor', 'true');
	await plantConfig(dir, 'remote.origin.url', source);
	await plantConfig(dir, 'remote.origin.uploadpack', script);
	await plantConfig(dir, 'protocol.file.allow', 'always');
	const blob = await git(dir, 'rev-parse', 'HEAD:.changeset/c.md');
	rmSync(join(dir, '.git/objects', blob.slice(0, 2), blob.slice(2)));
}

const ghCtx = (dir: string, r: Runner = runner): GhContext => ({
	runner: r,
	home: dir,
	now: Date.now,
	cwd: dir,
});
const INPUT = {
	repo: { owner: 'acme', repo: 'zorblax' },
	pkg: '@nxgt/zorblax',
	version: '1.0.1',
	dir: '.',
};

// Baselines: does the planted key run a command under raw git here?
async function fires(
	setup: (dir: string, script: string) => Promise<void>,
	argv: string[],
): Promise<boolean> {
	const dir = await makeRepo();
	const { script, marker } = plant('base');
	await setup(dir, script);
	await spawn(['git', ...argv], dir);
	return existsSync(marker);
}

const fsmonitor = await fires(
	(dir, script) => plantConfig(dir, 'core.fsmonitor', script),
	['grep', '-n', 'Temporary'],
);
const gpg = await fires(
	(dir, script) => plantSignature(dir, script),
	['log', '-1'],
);
const external = await fires(
	(dir, script) => plantConfig(dir, 'diff.external', script),
	['diff', 'HEAD~1', 'HEAD'],
);
const lazy = await fires(
	(dir, script) => plantPromisor(dir, script),
	['show', 'HEAD:.changeset/c.md'],
);

const baselines = { fsmonitor, gpg, external, lazy };
const guarded = (baseline: boolean) => (baseline ? test : test.skip);

describe('baselines on this machine', () => {
	test('which planted keys fire under raw git', () => {
		console.log(`git-guard baselines: ${JSON.stringify(baselines)}`);
		// Skipping everything would pass vacuously; in CI that is a failure.
		if (process.env['CI']) {
			expect(Object.values(baselines).some(Boolean)).toBe(true);
		}
	});
});

describe('core.fsmonitor in the repository config', () => {
	guarded(fsmonitor)(
		'the markers grep: no marker, the line is found',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantConfig(dir, 'core.fsmonitor', script);
			const result = await runner.run(markerGrepArgv([]), { cwd: dir });
			expect(existsSync(marker)).toBe(false);
			expect(result.code).toBe(0);
			expect(parseMarkers(result.stdout).map((m) => m.number)).toEqual([1, 1]);
		},
	);

	guarded(fsmonitor)(
		'track findMarkers: no marker, the marker is found',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantConfig(dir, 'core.fsmonitor', script);
			const ctx = { runner, cwd: dir } as unknown as CliContext;
			const found = await findMarkers(ctx, {
				upstream: { repo: { owner: 'nxgt', repo: 'zorblax' }, number: 1 },
				packageName: '@nxgt/zorblax',
				title: 't',
				summary: 's',
			});
			expect(existsSync(marker)).toBe(false);
			expect(found).toEqual([{ file: 'packages/zorblax/x.ts', line: 2 }]);
		},
	);

	guarded(fsmonitor)(
		'a .git file pointing at another gitdir with the plant: no marker',
		async () => {
			const real = await makeRepo();
			const { script, marker } = plant();
			await plantConfig(real, 'core.fsmonitor', script);
			const link = tempDir('guard-link');
			writeFileSync(join(link, '.git'), `gitdir: ${join(real, '.git')}\n`);
			writeFileSync(join(link, 'b.ts'), '// Temporary, until acme#1\n');
			const result = await runner.run(markerGrepArgv([]), { cwd: link });
			expect(existsSync(marker)).toBe(false);
			expect(result.code).toBeLessThan(2);
		},
	);

	test('MARKER_GREP_ARGV starts with the bare git command', () => {
		expect(MARKER_GREP_ARGV[0]).toBe('git');
	});
});

describe('signature checks on git log', () => {
	guarded(gpg)(
		'the guard alone (log.showSignature=false) stops a raw git log',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantSignature(dir, script);
			const result = await onlyGuard.run(['git', 'log', '-1'], { cwd: dir });
			expect(result.code).toBe(0);
			expect(existsSync(marker)).toBe(false);
		},
	);

	guarded(gpg)(
		'the call site alone (--no-show-signature) stops loggedPrs',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantSignature(dir, script);
			const found = await loggedPrs(ghCtx(dir, bare), INPUT, []);
			expect(existsSync(marker)).toBe(false);
			expect(found.prs).toEqual([5]);
		},
	);

	guarded(gpg)(
		'the real runner: no marker, the PR numbers are returned',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantSignature(dir, script);
			const found = await loggedPrs(ghCtx(dir), INPUT, []);
			expect(existsSync(marker)).toBe(false);
			expect(found.prs).toEqual([5]);
		},
	);
});

describe('diff.external', () => {
	test('a patch diff still works through the runner (an empty diff.external would die with 128)', async () => {
		const dir = await makeRepo();
		const result = await runner.run(['git', 'diff', 'HEAD~1', 'HEAD'], {
			cwd: dir,
		});
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('+two');
	});

	guarded(external)(
		'the call-site flag (--no-ext-diff) keeps the planted driver from running',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantConfig(dir, 'diff.external', script);
			const calls: string[][] = [];
			const spy: Runner = {
				run: (argv, options) => {
					calls.push([...argv]);
					return bare.run(argv, options);
				},
				fetchJson: async () => ({}),
			};
			await commitTouches(ghCtx(dir, spy), 'HEAD', '.');
			expect(calls[0]).toContain('--no-ext-diff');
			// What the flag buys: the same patch diff with it, the driver unused.
			const withFlag = await bare.run(
				['git', 'diff', '--no-ext-diff', 'HEAD~1', 'HEAD'],
				{ cwd: dir },
			);
			expect(withFlag.code).toBe(0);
			expect(withFlag.stdout).toContain('+two');
			expect(existsSync(marker)).toBe(false);
		},
	);
});

describe('a partial clone lazily fetching a missing blob', () => {
	const read = (r: Runner, dir: string) =>
		addedChangesetPackages(ghCtx(dir, r), 'HEAD');

	guarded(lazy)('the per-protocol keys alone stop it', async () => {
		const dir = await makeRepo();
		const { script, marker } = plant();
		await plantPromisor(dir, script);
		await read(onlyGuard, dir);
		expect(existsSync(marker)).toBe(false);
	});

	guarded(lazy)('GIT_NO_LAZY_FETCH alone stops it', async () => {
		const dir = await makeRepo();
		const { script, marker } = plant();
		await plantPromisor(dir, script);
		await read(onlyEnv, dir);
		expect(existsSync(marker)).toBe(false);
	});

	test('an empty GIT_ALLOW_PROTOCOL alone stops a remote helper, as on a git older than 2.44', async () => {
		// The per-protocol keys do not name a helper, and GIT_NO_LAZY_FETCH does
		// nothing before git 2.44: this is the gap the empty variable closes.
		const dir = await makeRepo();
		const { script, marker } = plant('helper');
		const bin = tempDir('guard-helper-bin');
		copyFileSync(script, join(bin, 'git-remote-zorblaxhelper'));
		chmodSync(join(bin, 'git-remote-zorblaxhelper'), 0o755);
		await plantConfig(dir, 'core.repositoryformatversion', '1');
		await plantConfig(dir, 'extensions.partialClone', 'origin');
		await plantConfig(dir, 'remote.origin.promisor', 'true');
		await plantConfig(dir, 'remote.origin.url', 'zorblaxhelper::x');
		await plantConfig(dir, 'protocol.zorblaxhelper.allow', 'always');
		const blob = await git(dir, 'rev-parse', 'HEAD:.changeset/c.md');
		rmSync(join(dir, '.git/objects', blob.slice(0, 2), blob.slice(2)));
		const path = `${bin}:${process.env['PATH'] ?? ''}`;
		const show = ['show', '--no-textconv', 'HEAD:.changeset/c.md'];

		const { GIT_NO_LAZY_FETCH: _, ...oldGit } = childEnv({
			...process.env,
			PATH: path,
		});
		const raw = { ...oldGit, GIT_ALLOW_PROTOCOL: 'zorblaxhelper' };
		await spawn(hardenGit(['git', ...show]), dir, raw);
		if (!existsSync(marker)) return; // this git never calls the helper: nothing to prove
		rmSync(marker);

		await spawn(hardenGit(['git', ...show]), dir, oldGit);
		expect(existsSync(marker)).toBe(false);
	});

	guarded(lazy)(
		'the real runner: addedChangesetPackages and discoverFixes write no marker',
		async () => {
			const dir = await makeRepo();
			const { script, marker } = plant();
			await plantPromisor(dir, script);
			await read(runner, dir);
			await discoverFixes(ghCtx(dir), INPUT);
			expect(existsSync(marker)).toBe(false);
		},
	);

	test('the unprotected read does lazy-fetch when the baseline fires', async () => {
		if (!lazy) return;
		const dir = await makeRepo();
		const { script, marker } = plant();
		await plantPromisor(dir, script);
		await read(bare, dir);
		expect(existsSync(marker)).toBe(true);
	});
});

describe('the environment', () => {
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

	test('childEnv drops what redirects git or injects config and keeps the rest', () => {
		const dropped = [
			'GIT_DIR',
			'GIT_WORK_TREE',
			'GIT_INDEX_FILE',
			'GIT_COMMON_DIR',
			'GIT_OBJECT_DIRECTORY',
			'GIT_ALTERNATE_OBJECT_DIRECTORIES',
			'GIT_EXTERNAL_DIFF',
			'GIT_EXEC_PATH',
			'GIT_CONFIG_SYSTEM',
			'GIT_CONFIG_PARAMETERS',
			'GIT_CONFIG_COUNT',
			'GIT_CONFIG_KEY_0',
			'GIT_CONFIG_VALUE_0',
			'GIT_TRACE',
			'GIT_TRACE_PACKET',
			'BUN_OPTIONS',
		];
		const base: Record<string, string | undefined> = {
			GIT_CONFIG_GLOBAL: '/g',
			GIT_CONFIG_NOSYSTEM: '1',
			PATH: '/bin',
			HOME: '/h',
			GIT_PAGER: 'less',
			GIT_ALLOW_PROTOCOL: 'file:https',
			UNSET: undefined,
		};
		for (const key of dropped) base[key] = '/x';
		const out = childEnv(base);
		for (const key of dropped) expect(out[key]).toBeUndefined();
		expect(Object.keys(out).sort()).toEqual(
			[
				'GH_PROMPT_DISABLED',
				'GIT_ALLOW_PROTOCOL',
				'GIT_CONFIG_GLOBAL',
				'GIT_CONFIG_NOSYSTEM',
				'GIT_NO_LAZY_FETCH',
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
		expect(out['GIT_NO_LAZY_FETCH']).toBe('1');
		expect(out['GIT_ALLOW_PROTOCOL']).toBe('');
		expect(out['GH_PROMPT_DISABLED']).toBe('1');
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

	test('names the keys that can run a command, per protocol too, and not an empty diff.external', () => {
		for (const key of [
			'core.fsmonitor=false',
			'log.showSignature=false',
			'protocol.allow=never',
			'protocol.ext.allow=never',
			'protocol.file.allow=never',
			'protocol.ssh.allow=never',
			'--no-optional-locks',
		]) {
			expect(GIT_GUARD).toContain(key);
		}
		expect(GIT_GUARD).not.toContain('diff.external=');
	});
});

describe('the release call sites carry the second layer of flags', () => {
	function spy(): { runner: Runner; calls: string[][] } {
		const calls: string[][] = [];
		return {
			calls,
			runner: {
				async run(argv) {
					calls.push([...argv]);
					return { code: 0, stdout: '', stderr: '' };
				},
				fetchJson: async () => ({}),
			},
		};
	}
	const callsOf = (calls: string[][], sub: string) =>
		calls.filter((c) => c[1] === sub);

	test('log: --no-show-signature, and a revision only after --end-of-options', async () => {
		const s = spy();
		s.runner.run = async (argv) => {
			s.calls.push([...argv]);
			const out =
				argv[1] === 'tag' ? '@nxgt/zorblax@1.0.1\n@nxgt/zorblax@1.0.0\n' : '';
			return { code: 0, stdout: out, stderr: '' };
		};
		await loggedPrs(ghCtx('/h', s.runner), INPUT, []);
		const log = callsOf(s.calls, 'log')[0];
		expect(log).toContain('--no-show-signature');
		expect(log?.indexOf('--end-of-options')).toBeLessThan(
			log?.findIndex((a) => a.includes('..')) ?? -1,
		);
	});

	test('diff: --no-ext-diff --no-textconv', async () => {
		const s = spy();
		await commitTouches(ghCtx('/h', s.runner), 'abc', 'packages/zorblax');
		await addedChangesetPackages(ghCtx('/h', s.runner), 'abc');
		const diffs = callsOf(s.calls, 'diff');
		expect(diffs).toHaveLength(2);
		for (const d of diffs) {
			expect(d).toEqual(
				expect.arrayContaining(['--no-ext-diff', '--no-textconv']),
			);
		}
	});

	test('show in release-git: --no-textconv', async () => {
		const s = spy();
		s.runner.run = async (argv) => {
			s.calls.push([...argv]);
			return {
				code: 0,
				stdout: argv[1] === 'diff' ? '.changeset/c.md\n' : CHANGESET,
				stderr: '',
			};
		};
		await addedChangesetPackages(ghCtx('/h', s.runner), 'abc');
		const shows = callsOf(s.calls, 'show');
		expect(shows).toHaveLength(1);
		expect(shows[0]).toContain('--no-textconv');
	});

	test('show in release-prs: --no-textconv on both changelog reads', async () => {
		const s = spy();
		s.runner.run = async (argv) => {
			s.calls.push([...argv]);
			return { code: 1, stdout: '', stderr: '' };
		};
		await discoverFixes(ghCtx('/h', s.runner), INPUT).catch(() => undefined);
		const shows = callsOf(s.calls, 'show');
		expect(shows).toHaveLength(2);
		for (const show of shows) expect(show).toContain('--no-textconv');
	});

	test('tag and merge-base: names and revisions come after --end-of-options', async () => {
		const s = spy();
		await previousTag(ghCtx('/h', s.runner), INPUT);
		await hasTags(ghCtx('/h', s.runner), '@nxgt/zorblax');
		await isAncestor(ghCtx('/h', s.runner), 'abc123', '@nxgt/zorblax@1.0.1');
		const tags = callsOf(s.calls, 'tag');
		expect(tags).toHaveLength(2);
		for (const tag of tags) {
			expect(tag.indexOf('--end-of-options')).toBeGreaterThan(-1);
			expect(tag.indexOf('--end-of-options')).toBeLessThan(
				tag.indexOf('@nxgt/zorblax@*'),
			);
		}
		const merge = callsOf(s.calls, 'merge-base')[0];
		expect(merge?.indexOf('--end-of-options')).toBeGreaterThan(-1);
		expect(merge?.indexOf('--end-of-options')).toBeLessThan(
			merge?.indexOf('abc123') ?? -1,
		);
	});
});

describe('gh', () => {
	test('is never run in the untrusted working directory', async () => {
		const seen: (RunOptions | undefined)[] = [];
		const spy: Runner = {
			async run(_argv, options) {
				seen.push(options);
				return { code: 0, stdout: '{}', stderr: '' };
			},
			fetchJson: async () => ({}),
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

describe('every git goes through the runner as a bare git', () => {
	const lib = import.meta.dir;
	// Recursive, and paths relative to lib/: a file moved into a subfolder stays checked.
	const sources = (readdirSync(lib, { recursive: true }) as string[])
		.map((f) => f.replaceAll('\\', '/'))
		.filter((f) => f.endsWith('.ts') && !/\.(spec|fixtures)\.ts$/.test(f));
	const sees = (base: string) =>
		sources.some((f) => f === base || f.endsWith(`/${base}`));

	test('the check sees the files that run git, wherever they live', () => {
		for (const base of [
			'markers.ts',
			'track.ts',
			'release-git.ts',
			'deny-sources.ts',
		])
			expect(sees(base)).toBe(true);
		// Only in a subfolder: a flat readdirSync would miss them and this fails.
		expect(sources).toContain('scrub/scrub.ts');
		expect(sources).toContain('scrub/secrets/literals.ts');
	});

	test('a "git" literal is only ever the first element of an argv (so hardenGit applies)', () => {
		const offenders: string[] = [];
		for (const file of sources) {
			if (file === 'git-guard.ts' || file === 'runner.ts') continue;
			const text = readFileSync(join(lib, file), 'utf8');
			for (const m of text.matchAll(/(['"`])git\1/g)) {
				const before = text.slice(0, m.index).trimEnd();
				if (!before.endsWith('[')) {
					offenders.push(`${file}: ${text.slice(m.index - 30, m.index + 12)}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	// That only the runner spawns a process is no-network.spec.ts's job.
});
