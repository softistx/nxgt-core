import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRunner, networkAllowed } from './runner';
import { fakeRunner } from './runner.fixtures';
import { removeTempDirs, tempDir } from './temp.fixtures';

const ENTRY = '/x/issues.ts';

describe('networkAllowed', () => {
	test('is allowed outside tests', () => {
		expect(networkAllowed({}, ENTRY)).toBe(true);
		expect(networkAllowed({ NODE_ENV: 'production' }, ENTRY)).toBe(true);
	});

	test('is blocked under NODE_ENV=test', () => {
		expect(networkAllowed({ NODE_ENV: 'test' }, ENTRY)).toBe(false);
		expect(
			networkAllowed(
				{ NODE_ENV: 'test', NXGT_ISSUES_ALLOW_NETWORK: '0' },
				ENTRY,
			),
		).toBe(false);
	});

	test('NXGT_ISSUES_ALLOW_NETWORK=1 lifts the block', () => {
		expect(
			networkAllowed(
				{ NODE_ENV: 'test', NXGT_ISSUES_ALLOW_NETWORK: '1' },
				ENTRY,
			),
		).toBe(true);
	});
});

describe('networkAllowed: a spec entry is a test run whatever NODE_ENV says', () => {
	test.each([
		'/x/a.spec.ts',
		'/x/a.test.ts',
		'/x/a.spec.tsx',
		'/x/a.test.mjs',
		'C:/x/a.spec.cts',
	])('%s', (main) => {
		expect(networkAllowed({ NODE_ENV: 'development' }, main)).toBe(false);
		expect(networkAllowed({}, main)).toBe(false);
		expect(networkAllowed({ NXGT_ISSUES_ALLOW_NETWORK: '1' }, main)).toBe(true);
	});

	test('a real entry file is allowed', () => {
		expect(networkAllowed({ NODE_ENV: 'development' }, '/x/issues.ts')).toBe(
			true,
		);
		expect(networkAllowed({}, '/x/spec.ts')).toBe(true);
		expect(networkAllowed({}, '/x/respec.tsx.bak')).toBe(true);
	});

	test('the default entry, under bun test here, is a test run', () => {
		expect(networkAllowed({ NODE_ENV: 'development' })).toBe(false);
	});

	test('createRunner throws for a spec entry under NODE_ENV=development', async () => {
		const runner = createRunner({ NODE_ENV: 'development' });
		await expect(runner.run(['gh'])).rejects.toThrow(/blocked in a test run/);
		await expect(runner.fetchJson('https://x.invalid')).rejects.toThrow(
			/blocked in a test run/,
		);
	});
});

describe('the real runner under NODE_ENV=test', () => {
	const runner = createRunner({ NODE_ENV: 'test' });

	test('run throws without spawning', async () => {
		await expect(runner.run(['gh', 'auth', 'status'])).rejects.toThrow(
			/blocked in a test run/,
		);
	});

	test('fetchJson throws without fetching', async () => {
		await expect(runner.fetchJson('https://example.com/x')).rejects.toThrow(
			/blocked in a test run/,
		);
	});
});

describe('the real runner when allowed', () => {
	const runner = createRunner({
		NODE_ENV: 'test',
		NXGT_ISSUES_ALLOW_NETWORK: '1',
	});

	test('runs a process and captures its output and code', async () => {
		const result = await runner.run(['echo', 'hello']);
		expect(result).toEqual({ code: 0, stdout: 'hello\n', stderr: '' });
	});

	test('feeds stdin', async () => {
		const result = await runner.run(['cat'], { stdin: 'from stdin' });
		expect(result.stdout).toBe('from stdin');
	});

	test('reports a non-zero exit code', async () => {
		const result = await runner.run(['sh', '-c', 'echo oops >&2; exit 3']);
		expect(result.code).toBe(3);
		expect(result.stderr).toBe('oops\n');
	});

	test('kills a process past its timeout', async () => {
		const started = Date.now();
		const result = await runner.run(['sleep', '5'], { timeoutMs: 100 });
		expect(Date.now() - started).toBeLessThan(3000);
		expect(result.code).not.toBe(0);
	});
});

describe('fakeRunner', () => {
	test('answers by argv prefix, records the calls and fills defaults', async () => {
		const fake = fakeRunner({
			run: [{ argv: ['gh', 'api'], result: { stdout: '{"a":1}' } }],
		});
		const result = await fake.run(['gh', 'api', 'repos/o/r'], { stdin: 'x' });
		expect(result).toEqual({ code: 0, stdout: '{"a":1}', stderr: '' });
		expect(fake.calls).toEqual([
			{ argv: ['gh', 'api', 'repos/o/r'], options: { stdin: 'x' } },
		]);
	});

	test('throws on a call no rule covers', async () => {
		const fake = fakeRunner();
		await expect(fake.run(['git', 'status'])).rejects.toThrow(/no rule/);
		await expect(fake.fetchJson('https://x')).rejects.toThrow(/no rule/);
		expect(fake.calls).toHaveLength(1);
		expect(fake.fetches).toEqual(['https://x']);
	});

	test('a rule can throw, and a fetch rule matches by substring', async () => {
		const fake = fakeRunner({
			run: [{ argv: ['gh'], throws: 'gh: not found' }],
			fetch: [
				{ url: 'registry.npmjs.org/a', json: { name: 'a' } },
				{ url: 'registry.npmjs.org/b', throws: 'timeout' },
			],
		});
		await expect(fake.run(['gh', 'x'])).rejects.toThrow('gh: not found');
		expect(await fake.fetchJson('https://registry.npmjs.org/a/latest')).toEqual(
			{
				name: 'a',
			},
		);
		await expect(
			fake.fetchJson('https://registry.npmjs.org/b'),
		).rejects.toThrow('timeout');
	});
});

afterAll(removeTempDirs);

describe('a detached run', () => {
	test('returns at once while the process goes on', async () => {
		const marker = join(tempDir('detached'), 'done');
		const runner = createRunner({ NXGT_ISSUES_ALLOW_NETWORK: '1' });
		const started = performance.now();
		const result = await runner.run(
			['sh', '-c', `sleep 0.3; touch '${marker}'`],
			{ detached: true },
		);
		expect(result).toEqual({ code: 0, stdout: '', stderr: '' });
		expect(performance.now() - started).toBeLessThan(250);
		expect(existsSync(marker)).toBe(false);
		for (let i = 0; i < 40 && !existsSync(marker); i++) await Bun.sleep(50);
		expect(existsSync(marker)).toBe(true);
	});
});

/** Kills a pid a spec started, whatever state it is in. */
const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const reap = (pidFile: string): void => {
	try {
		process.kill(Number(readFileSync(pidFile, 'utf8').trim()), 'SIGKILL');
	} catch {
		// already gone
	}
};

describe('the real runner: a timeout is bounded', () => {
	const runner = createRunner({ NXGT_ISSUES_ALLOW_NETWORK: '1' });

	test('a grandchild holding the pipe does not hold the call past its timeout', async () => {
		const dir = tempDir('grandchild');
		const pidFile = join(dir, 'pid');
		const script = join(dir, 'gh');
		// Forks a sleeper that inherits stdout, then waits on it.
		writeFileSync(script, `sleep 8 &\necho $! > '${pidFile}'\nwait\n`);
		try {
			const started = performance.now();
			const result = await runner.run(['sh', script], { timeoutMs: 300 });
			expect(performance.now() - started).toBeLessThan(1500);
			expect(result.code).not.toBe(0);
			// The whole process group is killed: the sleeper is gone without our help.
			const sleeper = Number(readFileSync(pidFile, 'utf8').trim());
			await Bun.sleep(100);
			expect(alive(sleeper)).toBe(false);
		} finally {
			reap(pidFile);
		}
	});

	test('output written before the timeout is kept', async () => {
		const dir = tempDir('partial-output');
		const pidFile = join(dir, 'pid');
		const script = join(dir, 'gh');
		writeFileSync(
			script,
			`echo early\nsleep 8 &\necho $! > '${pidFile}'\nwait\n`,
		);
		try {
			const result = await runner.run(['sh', script], { timeoutMs: 300 });
			expect(result.stdout).toContain('early');
		} finally {
			reap(pidFile);
		}
	});

	test('a call cut by its timeout says so; one that finished or was aborted does not', async () => {
		const cut = await runner.run(['sleep', '8'], { timeoutMs: 100 });
		expect(cut.timedOut).toBe(true);
		const done = await runner.run(['echo', 'x']);
		expect(done.timedOut).toBeUndefined();
		const controller = new AbortController();
		const pending = runner.run(['sleep', '8'], {
			timeoutMs: 20_000,
			signal: controller.signal,
		});
		await Bun.sleep(50);
		controller.abort();
		expect((await pending).timedOut).toBeUndefined();
	});

	test('aborting the signal kills the child at once', async () => {
		const controller = new AbortController();
		const started = performance.now();
		const pending = runner.run(['sleep', '8'], {
			timeoutMs: 20_000,
			signal: controller.signal,
		});
		await Bun.sleep(100);
		controller.abort();
		const result = await pending;
		expect(performance.now() - started).toBeLessThan(2000);
		expect(result.code).not.toBe(0);
	});

	test('a signal already aborted starts nothing', async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await runner.run(['sleep', '8'], {
			signal: controller.signal,
		});
		expect(result.code).not.toBe(0);
	});
});
