import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkout, home, removeTempDirs } from '../lib/session.fixtures';

afterAll(removeTempDirs);

const entry = join(import.meta.dir, 'session-start.ts');

async function run(
	cwd: string,
	env: Record<string, string>,
	stdin = JSON.stringify({ cwd, hook_event_name: 'SessionStart' }),
) {
	const child = Bun.spawn([process.execPath, entry], {
		cwd,
		env: { PATH: process.env['PATH'] ?? '', NODE_ENV: 'test', ...env },
		stdin: new Blob([stdin]),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, code] = await Promise.all([
		new Response(child.stdout).text(),
		child.exited,
	]);
	return { stdout, code };
}

// NODE_ENV=test makes the real runner throw on any call, so these runs also
// prove that the cases below reach no gh.
describe('hooks/session-start.ts', () => {
	test.each([
		['a foreign origin', () => checkout('git@github.com:acme/quillon.git'), {}],
		[
			'disabled',
			() => checkout('git@github.com:softistx/nxgt-zorblax.git'),
			{ NXGT_ISSUES_DISABLE: '1' },
		],
		['no checkout', () => home(), {}],
	])('%s: prints nothing, exits 0', async (_name, make, env) => {
		const cwd = make();
		const result = await run(cwd, { NXGT_ISSUES_HOME: home(), ...env });
		expect(result).toEqual({ stdout: '', code: 0 });
	});

	test('a cold cache under a test run (runner blocked) fails open', async () => {
		const cwd = checkout('git@github.com:softistx/nxgt-zorblax.git');
		expect(await run(cwd, { NXGT_ISSUES_HOME: home() })).toEqual({
			stdout: '',
			code: 0,
		});
	});

	test('unparseable stdin prints a systemMessage and still exits 0', async () => {
		const cwd = checkout('git@github.com:softistx/nxgt-zorblax.git');
		const result = await run(cwd, { NXGT_ISSUES_HOME: home() }, 'not json');
		expect(result.code).toBe(0);
		expect(result.stdout).toContain('systemMessage');
	});
});
