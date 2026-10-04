/** Both hooks end to end: spawned the way Claude Code spawns them. */

import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { agentReminder } from '../lib/economy';

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
		const { code, out } = await run('pre-agent.ts', agent({ prompt: 'x' }), {
			CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet',
		});
		expect(code).toBe(0);
		expect(out).toEqual({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				additionalContext: agentReminder(
					{ tool_name: 'Agent', tool_input: {} },
					{ CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' },
				),
			},
		});
	});
	test('prints nothing on empty stdin', async () => {
		const { code, out } = await run('pre-agent.ts', '', {});
		expect(code).toBe(0);
		expect(out).toBeUndefined();
	});
	test('prints nothing with a model', async () => {
		expect(
			(await run('pre-agent.ts', agent({ model: 'haiku' }), {})).out,
		).toBeUndefined();
	});
	test('fails open on garbage input', async () => {
		const { code, out } = await run('pre-agent.ts', 'not json', {});
		expect(code).toBe(0);
		expect(Object.keys(out)).toEqual(['systemMessage']);
		expect(out.systemMessage).toContain('did nothing');
	});
});
