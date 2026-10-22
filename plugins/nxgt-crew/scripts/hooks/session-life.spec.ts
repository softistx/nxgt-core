/** The hooks end to end, over one session's life and a peer's (see `hooks.harness.ts`). */

import { describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import {
	CREW,
	decision,
	home,
	pre,
	repo,
	run,
	sandbox,
	scratch,
} from './hooks.harness';

sandbox();

describe('a session’s life', () => {
	test('SessionStart registers A, exports its id, and briefs it', async () => {
		const envFile = join(scratch, 'env-a');
		writeFileSync(envFile, '');
		const r = await run(
			'session-start.ts',
			{
				session_id: 'aaaaaaaa-1',
				cwd: repo,
				hook_event_name: 'SessionStart',
				source: 'startup',
				scratchpad_dir: join(scratch, 'pad-a'),
			},
			{ CLAUDE_ENV_FILE: envFile },
		);
		expect(r.code).toBe(0);
		expect(r.out?.['hookSpecificOutput']?.additionalContext).toContain(
			'No other live session',
		);
		expect(readFileSync(envFile, 'utf8')).toBe(
			"export NXGT_CREW_SESSION_ID='aaaaaaaa-1'\n",
		);
		const rec = JSON.parse(
			readFileSync(join(home, 'sessions', 'aaaaaaaa-1.json'), 'utf8'),
		);
		expect(rec).toMatchObject({
			sessionId: 'aaaaaaaa-1',
			worktree: repo,
			branch: 'develop',
		});
		expect(rec.claims[0].path).toBe(join(scratch, 'pad-a'));
	});

	test('SessionStart for B in the same repository names A', async () => {
		const r = await run('session-start.ts', {
			session_id: 'bbbbbbbb-2',
			cwd: repo,
			hook_event_name: 'SessionStart',
			source: 'startup',
		});
		const context: string = r.out?.['hookSpecificOutput']?.additionalContext;
		expect(context).toContain('1 other live session');
		expect(context).toContain('Same repository:');
		expect(context).toContain('aaaaaaaa');
	});

	test('PostToolUse records A’s edit', async () => {
		const r = await run('activity.ts', {
			session_id: 'aaaaaaaa-1',
			cwd: repo,
			hook_event_name: 'PostToolUse',
			tool_name: 'Edit',
			tool_input: { file_path: join(repo, 'a.ts') },
			tool_response: {},
		});
		expect(r).toEqual({ code: 0, out: undefined });
		const rec = JSON.parse(
			readFileSync(join(home, 'sessions', 'aaaaaaaa-1.json'), 'utf8'),
		);
		expect(rec.edits[0]).toMatchObject({
			path: join(repo, 'a.ts'),
			worktree: repo,
		});
	});

	test('B editing the file A holds is denied, naming A', async () => {
		const r = await pre('bbbbbbbb-2', 'Edit', {
			file_path: join(repo, 'a.ts'),
		});
		expect(r.code).toBe(0);
		expect(decision(r)).toBe('deny');
		expect(r.out?.['hookSpecificOutput']?.permissionDecisionReason).toContain(
			'aaaaaaaa',
		);
	});

	test('B editing another file in the shared worktree is allowed, with a note', async () => {
		const r = await pre('bbbbbbbb-2', 'Write', {
			file_path: join(repo, 'new/b.ts'),
		});
		expect(decision(r)).toBeUndefined();
		expect(r.out?.['hookSpecificOutput']?.additionalContext).toContain(
			'is shared with another live session',
		);
	});

	test('B switching the branch A works on is denied', async () => {
		const r = await pre('bbbbbbbb-2', 'Bash', {
			command: 'git checkout -b other',
		});
		expect(decision(r)).toBe('deny');
	});

	test('B deleting A’s scratchpad is denied; a harmless command says nothing', async () => {
		expect(
			decision(
				await pre('bbbbbbbb-2', 'Bash', {
					command: `rm -rf ${join(scratch, 'pad-a')}`,
				}),
			),
		).toBe('deny');
		expect(
			(await pre('bbbbbbbb-2', 'Bash', { command: 'ls -la' })).out,
		).toBeUndefined();
	});

	test('B publishing is allowed and recorded; A reads it at its next prompt', async () => {
		const r = await pre('bbbbbbbb-2', 'Bash', { command: 'bun publish' });
		expect(decision(r)).toBeUndefined();
		expect(r.out?.['hookSpecificOutput']?.additionalContext).toContain(
			'this command publishes',
		);
		const prompt = await run('prompt.ts', {
			session_id: 'aaaaaaaa-1',
			cwd: repo,
			hook_event_name: 'UserPromptSubmit',
			prompt: 'hi',
		});
		expect(prompt.out?.['hookSpecificOutput']?.additionalContext).toContain(
			'release: publishing: bun publish',
		);
		const again = await run('prompt.ts', {
			session_id: 'aaaaaaaa-1',
			cwd: repo,
			hook_event_name: 'UserPromptSubmit',
			prompt: 'hi',
		});
		expect(again.out).toBeUndefined();
	});

	test('the CLI announces for B and lists both', async () => {
		const env = {
			...process.env,
			NXGT_CREW_HOME: home,
			NXGT_CREW_SESSION_ID: 'bbbbbbbb-2',
		};
		const said =
			await $`bun ${CREW} announce --kind working packages/janus-mail`
				.env(env)
				.quiet();
		expect(said.stdout.toString()).toContain('announced (working)');
		const list = (await $`bun ${CREW} list`.env(env).quiet()).stdout.toString();
		expect(list).toContain('This session: bbbbbbbb');
		expect(list).toContain('working: packages/janus-mail');
		expect(list).toContain('aaaaaaaa');
		const json = JSON.parse(
			(await $`bun ${CREW} list --json`.env(env).quiet()).stdout.toString(),
		);
		expect(json.peers.map((p: { sessionId: string }) => p.sessionId)).toEqual([
			'aaaaaaaa-1',
		]);
	});

	test('plans and roadmaps align across sessions through the CLI', async () => {
		await $`mkdir -p ${join(repo, 'docs')}`.quiet();
		writeFileSync(
			join(repo, 'docs', 'roadmap.md'),
			'## Next\n\n- **Mail transport** — send mail\n',
		);
		const envA = {
			...process.env,
			NXGT_CREW_HOME: home,
			NXGT_CREW_SESSION_ID: 'aaaaaaaa-1',
		};
		const envB = { ...envA, NXGT_CREW_SESSION_ID: 'bbbbbbbb-2' };
		const noEntry = await $`bun ${CREW} announce --kind plan something`
			.env(envA)
			.quiet()
			.nothrow();
		expect(noEntry.exitCode).toBe(1);
		await $`bun ${CREW} announce --kind plan --entry ${'Mail transport'} --needs ${'@nxgt/mail@0.5.0'}`
			.env(envA)
			.quiet();
		await $`bun ${CREW} announce --kind plan --entry ${'mail transport'}`
			.env(envB)
			.quiet();
		const text = (
			await $`bun ${CREW} align`.env(envB).quiet()
		).stdout.toString();
		expect(text).toContain('Roadmaps read (');
		expect(text).toContain('Same entry in two sessions:');
		expect(text).toContain('needs @nxgt/mail@0.5.0: not yet released');
		const json = JSON.parse(
			(await $`bun ${CREW} align --json`.env(envB).quiet()).stdout.toString(),
		);
		expect(json.duplicates).toHaveLength(1);
		expect(json.sessions[0].roadmaps[0].entries).toEqual([
			{ section: 'Next', title: 'Mail transport' },
		]);
	});

	test('A yields its hold with the CLI, and B may then edit the file', async () => {
		const env = {
			...process.env,
			NXGT_CREW_HOME: home,
			NXGT_CREW_SESSION_ID: 'aaaaaaaa-1',
		};
		const out = await $`bun ${CREW} yield ${join(repo, 'a.ts')}`
			.env(env)
			.quiet();
		expect(out.stdout.toString()).toContain('released the hold');
		expect(
			decision(
				await pre('bbbbbbbb-2', 'Edit', { file_path: join(repo, 'a.ts') }),
			),
		).toBeUndefined();
	});

	test('SessionEnd removes A, and B may then edit the file', async () => {
		await run('session-end.ts', {
			session_id: 'aaaaaaaa-1',
			cwd: repo,
			hook_event_name: 'SessionEnd',
			reason: 'other',
		});
		expect(readdirSync(join(home, 'sessions')).sort()).toEqual([
			'bbbbbbbb-2.json',
		]);
		expect(
			decision(
				await pre('bbbbbbbb-2', 'Edit', { file_path: join(repo, 'a.ts') }),
			),
		).toBeUndefined();
	});
});

describe('a git repository in the home folder (#320)', () => {
	const start = (id: string, cwd: string, fakeHome: string) =>
		run(
			'session-start.ts',
			{
				session_id: id,
				cwd,
				hook_event_name: 'SessionStart',
				source: 'startup',
			},
			{ HOME: fakeHome },
		);

	test('SessionStart warns, and the stray repository is no worktree', async () => {
		const fakeHome = realpathSync(
			mkdtempSync(join(tmpdir(), 'nxgt-crew-home-')),
		);
		try {
			expect(fakeHome.startsWith(realpathSync(tmpdir()))).toBe(true);
			await $`git init -q ${fakeHome}`.quiet();
			const sub = join(fakeHome, 'notes');
			mkdirSync(sub);
			const r = await start('hhhhhhhh-1', sub, fakeHome);
			expect(r.out?.['hookSpecificOutput']?.additionalContext).toContain(
				'~/.git exists',
			);
			const rec = JSON.parse(
				readFileSync(join(home, 'sessions', 'hhhhhhhh-1.json'), 'utf8'),
			);
			expect(rec.worktree).toBeUndefined();
		} finally {
			rmSync(fakeHome, { recursive: true, force: true });
		}
	});

	test('SessionStart stays quiet without ~/.git', async () => {
		const fakeHome = realpathSync(
			mkdtempSync(join(tmpdir(), 'nxgt-crew-home-')),
		);
		try {
			const r = await start('hhhhhhhh-2', fakeHome, fakeHome);
			expect(r.out?.['hookSpecificOutput']?.additionalContext).not.toContain(
				'~/.git exists',
			);
		} finally {
			rmSync(fakeHome, { recursive: true, force: true });
		}
	});
});

describe('HOME that is a symlink (#320)', () => {
	test('a subfolder session records no worktree', async () => {
		const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'nxgt-crew-link-')));
		try {
			expect(tmp.startsWith(realpathSync(tmpdir()))).toBe(true);
			const real = join(tmp, 'real');
			const link = join(tmp, 'link');
			mkdirSync(real);
			await $`git init -q ${real}`.quiet();
			symlinkSync(real, link);
			const sub = join(real, 'notes');
			mkdirSync(sub);
			await run(
				'session-start.ts',
				{
					session_id: 'llllllll-1',
					cwd: sub,
					hook_event_name: 'SessionStart',
					source: 'startup',
				},
				{ HOME: link },
			);
			const rec = JSON.parse(
				readFileSync(join(home, 'sessions', 'llllllll-1.json'), 'utf8'),
			);
			expect(rec.worktree).toBeUndefined();
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});
