/** The hooks fail open: a broken registry or input warns and blocks nothing. */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	decision,
	HOOKS,
	home,
	pre,
	repo,
	run,
	sandbox,
	scratch,
} from './hooks.harness';

sandbox();

describe('fail open', () => {
	test('an unusable registry warns and blocks nothing', async () => {
		const file = join(scratch, 'not-a-dir');
		writeFileSync(file, 'x');
		const r = await run(
			'guard.ts',
			{
				session_id: 'cccccccc-3',
				cwd: repo,
				tool_name: 'Edit',
				tool_input: { file_path: join(repo, 'a.ts') },
			},
			{ NXGT_CREW_HOME: file },
		);
		expect(r.code).toBe(0);
		expect(decision(r)).toBeUndefined();
		expect(r.out?.systemMessage).toContain('registry unavailable');
	});

	test('unparseable input warns and blocks nothing', async () => {
		const proc = Bun.spawn(['bun', join(HOOKS, 'guard.ts')], {
			stdin: new Blob(['not json']),
			stdout: 'pipe',
			env: { ...process.env, NXGT_CREW_HOME: home },
		});
		const out = JSON.parse(await new Response(proc.stdout).text());
		expect(await proc.exited).toBe(0);
		expect(out.systemMessage).toContain('nxgt-crew');
	});

	test('a corrupt record is skipped', async () => {
		mkdirSync(join(home, 'sessions'), { recursive: true });
		writeFileSync(join(home, 'sessions', 'junk.json'), '{ nope');
		const r = await pre('bbbbbbbb-2', 'Edit', {
			file_path: join(repo, 'a.ts'),
		});
		expect(r.code).toBe(0);
		expect(r.out?.systemMessage).toBeUndefined();
	});

	test('NXGT_CREW_DISABLE=1 turns every hook into a no-op', async () => {
		const r = await run(
			'session-start.ts',
			{ session_id: 'dddddddd-4', cwd: repo },
			{ NXGT_CREW_DISABLE: '1' },
		);
		expect(r).toEqual({ code: 0, out: undefined });
	});
});
