/**
 * The harness for the hook specs: each script is spawned the way Claude Code
 * spawns it, with the event on stdin, against a registry and a git repository
 * that live in a temporary folder. `NXGT_CREW_HOME` points the registry there,
 * so no spec ever touches ~/.claude. `sandbox()` sets the folder up for one
 * spec file; `home`, `repo` and `scratch` are live bindings into it.
 */

import { afterAll, beforeAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

export const HOOKS = import.meta.dir;
export const CREW = join(HOOKS, '..', 'crew.ts');

export let scratch = '';
export let home = '';
export let repo = '';

/** A fresh registry and repository for the spec file that calls it. */
export function sandbox(): void {
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
}

export interface Run {
	readonly code: number;
	readonly out: Record<string, any> | undefined;
}

export async function run(
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

export const pre = (
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

export const decision = (r: Run) =>
	r.out?.hookSpecificOutput?.permissionDecision;
