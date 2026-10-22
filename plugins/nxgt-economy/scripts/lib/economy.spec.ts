import { describe, expect, test } from 'bun:test';
import { agentReminder, buildRule, disabled } from './economy';

describe('disabled', () => {
	test.each(['1', 'true', 'TRUE', ' 1 '])('%p opts out', (value) => {
		expect(disabled({ NXGT_ECONOMY_DISABLE: value })).toBe(true);
	});
	test.each([undefined, '', '0', 'false', 'yes'])('%p keeps it on', (value) => {
		expect(disabled({ NXGT_ECONOMY_DISABLE: value })).toBe(false);
	});
});

describe('buildRule', () => {
	test('names the three models and the delegation rules', () => {
		const rule = buildRule({ CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' });
		for (const word of [
			'`haiku`',
			'`sonnet`',
			'`opus`',
			'parallel',
			'NXGT_ECONOMY_DISABLE=1',
		])
			expect(rule).toContain(word);
	});
	test('states that Opus plans and Sonnet implements', () => {
		const rule = buildRule({ CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' });
		expect(rule).toContain('Opus plans, Sonnet implements');
		expect(rule).toContain('Token economy');
	});
	test('sends bulk messages to Sonnet', () => {
		const rule = buildRule({ CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' });
		expect(rule).toContain('Bulk messages between sessions');
		expect(rule).toContain('Token economy');
	});
	test('adds the note when the subagent model is unset', () => {
		const rule = buildRule({});
		expect(rule).toContain('env.CLAUDE_CODE_SUBAGENT_MODEL=sonnet');
		expect(rule).toContain('inherit the main model');
	});
	test('treats a blank value as unset', () => {
		expect(buildRule({ CLAUDE_CODE_SUBAGENT_MODEL: ' ' })).toContain('inherit');
	});
	test('has no note when it is set', () => {
		expect(buildRule({ CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' })).not.toContain(
			'inherit',
		);
	});
});

describe('agentReminder', () => {
	const agent = (tool_input: Record<string, unknown>) => ({
		tool_name: 'Agent',
		tool_input,
	});
	test('reminds when no model is passed, naming the env model', () => {
		const text = agentReminder(agent({ prompt: 'x' }), {
			CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet',
		});
		expect(text).toContain('run on sonnet');
		expect(text).toContain('model: "haiku"');
		expect(text).toContain('model: "opus"');
	});
	test('mentions sonnet for an implementation in the generic reminder', () => {
		expect(agentReminder(agent({ prompt: 'x' }), {})).toContain(
			'model: "sonnet"',
		);
	});
	test('tells a Plan agent without a model to pass opus', () => {
		const text = agentReminder(agent({ subagent_type: 'Plan' }), {});
		expect(text).toContain('model: "opus"');
		expect(text).toContain('Plan agent');
	});
	test('stays silent for a Plan agent that passes opus', () => {
		expect(
			agentReminder(agent({ subagent_type: 'Plan', model: 'opus' }), {}),
		).toBeUndefined();
	});
	test('stays silent for a Plan agent that passes sonnet', () => {
		expect(
			agentReminder(agent({ subagent_type: 'Plan', model: 'sonnet' }), {}),
		).toBeUndefined();
	});
	test('matches Plan exactly, so lowercase gets the generic reminder', () => {
		const text = agentReminder(agent({ subagent_type: 'plan' }), {});
		expect(text).toContain('model: "sonnet"');
		expect(text).not.toContain('a Plan agent writes');
	});
	test("names the main session's model when the env is unset", () => {
		expect(agentReminder(agent({}), {})).toContain("the main session's model");
	});
	test('stays silent when a model is passed', () => {
		expect(agentReminder(agent({ model: 'haiku' }), {})).toBeUndefined();
	});
	test('skips a fork', () => {
		expect(agentReminder(agent({ subagent_type: 'fork' }), {})).toBeUndefined();
	});
	test('ignores other tools', () => {
		expect(
			agentReminder({ tool_name: 'Bash', tool_input: {} }, {}),
		).toBeUndefined();
		expect(agentReminder({}, {})).toBeUndefined();
	});
});
