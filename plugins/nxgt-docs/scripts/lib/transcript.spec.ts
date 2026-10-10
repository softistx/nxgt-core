import { describe, expect, test } from 'bun:test';
import { auditorPending } from './transcript';

const launch = (
	id: string,
	type = 'nxgt-docs:documentation-auditor',
	extra: Record<string, unknown> = {},
) =>
	JSON.stringify({
		type: 'assistant',
		...extra,
		message: {
			role: 'assistant',
			content: [
				{
					type: 'tool_use',
					id,
					name: 'Agent',
					input: {
						subagent_type: type,
						prompt: 'audit',
						run_in_background: true,
					},
				},
			],
		},
	});

const asyncResult = (id: string) =>
	JSON.stringify({
		type: 'user',
		message: {
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: id,
					content: [
						{
							type: 'text',
							text: 'Async agent launched successfully.\nagentId: a1',
						},
					],
				},
			],
		},
		toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a1' },
	});

const report = (id: string) =>
	JSON.stringify({
		type: 'user',
		message: {
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: id,
					content: [{ type: 'text', text: 'ok: true' }],
				},
			],
		},
		toolUseResult: { status: 'completed' },
	});

const notification = (id: string) =>
	JSON.stringify({
		type: 'queue-operation',
		operation: 'enqueue',
		content: `<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>${id}</tool-use-id>\n<status>completed</status>\n</task-notification>`,
	});

const lines = (...l: string[]) => l.join('\n');

describe('auditorPending', () => {
	test('no auditor launched is not pending', () => {
		expect(
			auditorPending(
				lines(launch('t1', 'nxgt-review:code-reviewer'), asyncResult('t1')),
			),
		).toBe(false);
		expect(auditorPending('')).toBe(false);
	});

	test('a background launch with no notification is pending', () => {
		expect(auditorPending(lines(launch('t1'), asyncResult('t1')))).toBe(true);
	});

	test('its task-notification ends it', () => {
		expect(
			auditorPending(
				lines(launch('t1'), asyncResult('t1'), notification('t1')),
			),
		).toBe(false);
	});

	test('a foreground run with its report is over', () => {
		expect(auditorPending(lines(launch('t1'), report('t1')))).toBe(false);
	});

	test('a launch without a result (interrupted) is not pending', () => {
		expect(auditorPending(launch('t1'))).toBe(false);
	});

	test('one finished run does not hide another still running', () => {
		expect(
			auditorPending(
				lines(
					launch('t1'),
					asyncResult('t1'),
					notification('t1'),
					launch('t2'),
					asyncResult('t2'),
				),
			),
		).toBe(true);
	});

	test('sidechain lines and junk lines are ignored', () => {
		expect(
			auditorPending(
				lines(
					launch('t1', undefined, { isSidechain: true }),
					asyncResult('t1'),
				),
			),
		).toBe(false);
		expect(
			auditorPending(
				lines(
					'{ not json documentation-auditor "tool_use"',
					launch('t1'),
					asyncResult('t1'),
				),
			),
		).toBe(true);
	});
});
