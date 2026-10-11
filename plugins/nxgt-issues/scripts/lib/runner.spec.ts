import { describe, expect, test } from 'bun:test';
import { createRunner, networkAllowed } from './runner';
import { fakeRunner } from './runner.fixtures';

describe('networkAllowed', () => {
	test('is allowed outside tests', () => {
		expect(networkAllowed({})).toBe(true);
		expect(networkAllowed({ NODE_ENV: 'production' })).toBe(true);
	});

	test('is blocked under NODE_ENV=test', () => {
		expect(networkAllowed({ NODE_ENV: 'test' })).toBe(false);
		expect(
			networkAllowed({ NODE_ENV: 'test', NXGT_ISSUES_ALLOW_NETWORK: '0' }),
		).toBe(false);
	});

	test('NXGT_ISSUES_ALLOW_NETWORK=1 lifts the block', () => {
		expect(
			networkAllowed({ NODE_ENV: 'test', NXGT_ISSUES_ALLOW_NETWORK: '1' }),
		).toBe(true);
	});
});

describe('the real runner under NODE_ENV=test', () => {
	const runner = createRunner({ NODE_ENV: 'test' });

	test('run throws without spawning', async () => {
		await expect(runner.run(['gh', 'auth', 'status'])).rejects.toThrow(
			/blocked under NODE_ENV=test/,
		);
	});

	test('fetchJson throws without fetching', async () => {
		await expect(runner.fetchJson('https://example.com/x')).rejects.toThrow(
			/blocked under NODE_ENV=test/,
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
