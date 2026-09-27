/**
 * The hooks end to end: each script is spawned the way Claude Code spawns it,
 * with the event on stdin, against a registry and a git repository that live
 * in a temporary folder. `NXGT_CREW_HOME` points the registry there, so no
 * spec ever touches ~/.claude.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

const HOOKS = import.meta.dir;
const CREW = join(HOOKS, '..', 'crew.ts');

let scratch: string;
let home: string;
let repo: string;

interface Run {
	readonly code: number;
	readonly out: Record<string, any> | undefined;
}

async function run(
	script: string,
	input: Record<string, unknown>,
	env: Record<string, string> = {},
): Promise<Run> {
	const proc = Bun.spawn(['bun', join(HOOKS, script)], {
		stdin: new Blob([JSON.stringify(input)]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, NXGT_CREW_HOME: home, ...env },
	});
	const text = (await new Response(proc.stdout).text()).trim();
	const code = await proc.exited;
	return { code, out: text ? JSON.parse(text) : undefined };
}

const pre = (
	session: string,
	tool: string,
	toolInput: Record<string, unknown>,
	cwd = repo,
) =>
	run('guard.ts', {
		session_id: session,
		cwd,
		hook_event_name: 'PreToolUse',
		tool_name: tool,
		tool_input: toolInput,
	});

const decision = (r: Run) => r.out?.hookSpecificOutput?.permissionDecision;

beforeAll(async () => {
	scratch = mkdtempSync(join(tmpdir(), 'nxgt-crew-spec-'));
	home = join(scratch, 'crew');
	repo = join(scratch, 'repo');
	await $`git init -q -b develop ${repo} && git -C ${repo} -c user.email=t@t -c user.name=t commit -q --allow-empty -m init`.quiet();
	writeFileSync(join(repo, 'a.ts'), 'a');
});

afterAll(() => {
	rmSync(scratch, { recursive: true, force: true });
});

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
		expect(r.out?.hookSpecificOutput?.additionalContext).toContain(
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
		const context: string = r.out?.hookSpecificOutput?.additionalContext;
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
		expect(r.out?.hookSpecificOutput?.permissionDecisionReason).toContain(
			'aaaaaaaa',
		);
	});

	test('B editing another file in the shared worktree is allowed, with a note', async () => {
		const r = await pre('bbbbbbbb-2', 'Write', {
			file_path: join(repo, 'new/b.ts'),
		});
		expect(decision(r)).toBeUndefined();
		expect(r.out?.hookSpecificOutput?.additionalContext).toContain(
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
		expect(r.out?.hookSpecificOutput?.additionalContext).toContain(
			'this command publishes',
		);
		const prompt = await run('prompt.ts', {
			session_id: 'aaaaaaaa-1',
			cwd: repo,
			hook_event_name: 'UserPromptSubmit',
			prompt: 'hi',
		});
		expect(prompt.out?.hookSpecificOutput?.additionalContext).toContain(
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
