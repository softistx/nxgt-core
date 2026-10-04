/** Both hooks end to end: spawned the way Claude Code spawns them. */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

async function run(script: string, stdin: string, env: Record<string, string>) {
	const proc = Bun.spawn(['bun', join(import.meta.dir, script)], {
		stdin: new Blob([stdin]),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, NXGT_ECONOMY_DISABLE: '', ...env },
	});
	const text = (await new Response(proc.stdout).text()).trim();
	return { code: await proc.exited, out: text ? JSON.parse(text) : undefined };
}

const agent = (input: Record<string, unknown>) =>
	JSON.stringify({
		hook_event_name: 'PreToolUse',
		tool_name: 'Agent',
		tool_input: input,
	});

describe('session-start.ts', () => {
	test('emits the rule as additionalContext and exits 0', async () => {
		const { code, out } = await run('session-start.ts', '{}', {
			CLAUDE_CODE_SUBAGENT_MODEL: '',
		});
		expect(code).toBe(0);
		expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
		expect(out.hookSpecificOutput.additionalContext).toContain('`haiku`');
		expect(out.hookSpecificOutput.additionalContext).toContain('inherit');
	});
	test('prints nothing when disabled', async () => {
		const { code, out } = await run('session-start.ts', '{}', {
			NXGT_ECONOMY_DISABLE: '1',
		});
		expect(code).toBe(0);
		expect(out).toBeUndefined();
	});
});

describe('pre-agent.ts', () => {
	test('reminds without deciding anything', async () => {
		const { code, out } = await run('pre-agent.ts', agent({ prompt: 'x' }), {});
		expect(code).toBe(0);
		expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
		expect(out.hookSpecificOutput.additionalContext).toContain('nxgt-economy');
		expect(out.hookSpecificOutput.permissionDecision).toBeUndefined();
		expect(out.hookSpecificOutput.updatedInput).toBeUndefined();
	});
	test('prints nothing with a model', async () => {
		expect(
			(await run('pre-agent.ts', agent({ model: 'haiku' }), {})).out,
		).toBeUndefined();
	});
	test('fails open on garbage input', async () => {
		const { code, out } = await run('pre-agent.ts', 'not json', {});
		expect(code).toBe(0);
		expect(out.systemMessage).toContain('did nothing');
	});
});
