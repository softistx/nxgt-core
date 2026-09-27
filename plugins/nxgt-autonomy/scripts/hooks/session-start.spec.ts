/**
 * The hook end to end: spawned the way Claude Code spawns it, with the event
 * on stdin, from a git repository and from a folder outside one, both under a
 * temporary folder.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMandate } from '../lib/mandate';

const SCRIPT = join(import.meta.dir, 'session-start.ts');

let scratch: string;
let repo: string;
let outside: string;

beforeAll(() => {
	scratch = mkdtempSync(join(tmpdir(), 'nxgt-autonomy-'));
	repo = join(scratch, 'repo');
	outside = join(scratch, 'outside');
	mkdirSync(join(repo, '.git', 'refs'), { recursive: true });
	mkdirSync(join(repo, 'packages', 'a'), { recursive: true });
	mkdirSync(outside);
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

async function run(
	stdin: string,
	env: Record<string, string> = {},
	cwd?: string,
) {
	const proc = Bun.spawn(['bun', SCRIPT], {
		cwd,
		stdin: new Blob([stdin]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, NXGT_AUTONOMY_DISABLE: '', ...env },
	});
	const text = (await new Response(proc.stdout).text()).trim();
	return { code: await proc.exited, out: text ? JSON.parse(text) : undefined };
}

const start = (cwd: string) =>
	JSON.stringify({
		session_id: 's1',
		cwd,
		hook_event_name: 'SessionStart',
		source: 'startup',
	});

describe('session-start.ts', () => {
	test('in a git repository, puts the mandate in context', async () => {
		const { code, out } = await run(start(join(repo, 'packages', 'a')));
		expect(code).toBe(0);
		expect(out).toEqual({
			hookSpecificOutput: {
				hookEventName: 'SessionStart',
				additionalContext: buildMandate(),
			},
		});
	});

	test('outside a git repository, prints nothing', async () => {
		expect(await run(start(outside))).toEqual({ code: 0, out: undefined });
	});

	test('NXGT_AUTONOMY_DISABLE=1 prints nothing, even in a repository', async () => {
		expect(await run(start(repo), { NXGT_AUTONOMY_DISABLE: '1' })).toEqual({
			code: 0,
			out: undefined,
		});
	});

	test('a cwd that is not a string falls back to the process directory', async () => {
		const input = JSON.stringify({ session_id: 's1', cwd: 42 });
		expect((await run(input, {}, outside)).out).toBeUndefined();
		expect((await run(input, {}, repo)).out?.hookSpecificOutput).toBeDefined();
	});

	test('fails open on input it cannot read: exit 0 and a warning only', async () => {
		const { code, out } = await run('not json');
		expect(code).toBe(0);
		expect(Object.keys(out)).toEqual(['systemMessage']);
		expect(out.systemMessage).toContain('nxgt-autonomy');
	});
});
