import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureLabels, LABELS } from './labels';
import { fakeRunner } from './runner.fixtures';

const WIDGET = { owner: 'softistx', repo: 'nxgt-widget' };

const ctxWith = (present: string[]) => ({
	runner: fakeRunner({
		run: [
			{
				argv: ['gh', 'label', 'list'],
				result: { stdout: JSON.stringify(present.map((name) => ({ name }))) },
			},
			{ argv: ['gh', 'label', 'create'] },
		],
	}),
	home: mkdtempSync(join(tmpdir(), 'nxgt-issues-labels-')),
	now: () => 0,
});

describe('ensureLabels', () => {
	test('creates only what is missing, comparing case-insensitively', async () => {
		const ctx = ctxWith(['Bug', 'documentation']);
		const created = await ensureLabels(ctx, WIDGET, ['bug', 'consumer-report']);
		expect(created).toEqual(['consumer-report']);
		const creates = ctx.runner.calls.filter((c) => c.argv[2] === 'create');
		expect(creates).toHaveLength(1);
		expect(creates[0]?.argv).toEqual(
			expect.arrayContaining([
				'consumer-report',
				'--color',
				'fbca04',
				'-R',
				'softistx/nxgt-widget',
			]),
		);
	});

	test('nothing missing, nothing created', async () => {
		const ctx = ctxWith(['upstream']);
		expect(await ensureLabels(ctx, WIDGET, ['upstream'])).toEqual([]);
		expect(ctx.runner.calls).toHaveLength(1);
	});

	test('an unknown label is a bug in the caller', async () => {
		const ctx = ctxWith([]);
		await expect(ensureLabels(ctx, WIDGET, ['wontfix'])).rejects.toThrow(
			'unknown label',
		);
	});

	test('every label the plan names is defined', () => {
		expect(Object.keys(LABELS).sort()).toEqual(
			[
				'bug',
				'consumer-report',
				'dependencies',
				'documentation',
				'enhancement',
				'released',
				'upstream',
			].sort(),
		);
	});
});
