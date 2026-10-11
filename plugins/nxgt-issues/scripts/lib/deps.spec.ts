import { afterAll, describe, expect, test } from 'bun:test';
import { callsOf, harness, makeApp, PKG, removeTempDirs } from './cli.fixtures';

afterAll(removeTempDirs);

import { EXIT } from './cli-context';
import { DEPS_TITLE, mergeRows, parseDepsTable } from './deps';
import { fileCommand } from './file';
import { dependenciesIssueBody } from './issue-body';

const deps = (rows: { name: string; current: string; latest: string }[]) =>
	JSON.stringify({ package: PKG, kind: 'dependencies', dependencies: rows });

const zod = { name: 'zod', current: '^3.22.0', latest: '4.1.0' };
const hono = { name: 'hono', current: '^3.0.0', latest: '4.6.0' };
const honoNow = { name: 'hono', current: '^3.0.0', latest: '4.7.0' };

const rolling = (
	state: string,
	rows: (typeof zod)[],
	labels: string[] = [],
) => [
	{
		argv: [
			'gh',
			'issue',
			'list',
			'--state',
			'all',
			'--limit',
			'200',
			'--label',
			'dependencies',
		],
		result: {
			stdout: JSON.stringify([
				{
					number: 3,
					title: DEPS_TITLE,
					state,
					url: 'https://github.com/softistx/nxgt-widget/issues/3',
					body: dependenciesIssueBody(rows),
					labels: labels.map((name) => ({ name })),
				},
			]),
		},
	},
];

describe('the rolling dependencies table', () => {
	test('parse and merge by name, new rows winning', () => {
		const body = dependenciesIssueBody([zod, hono]);
		expect(parseDepsTable(body)).toEqual([zod, hono]);
		expect(mergeRows([zod, hono], [honoNow])).toEqual([honoNow, zod]);
	});
});

describe('file: a dependencies report', () => {
	test('no rolling issue yet: one is filed with its labels', async () => {
		const h = harness({ cwd: makeApp(), stdin: deps([zod]) });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		const [create] = callsOf(h.runner, 'gh', 'issue', 'create');
		expect(create?.argv).toEqual(
			expect.arrayContaining([
				'--title',
				DEPS_TITLE,
				'--label',
				'dependencies,consumer-report',
			]),
		);
		expect(parseDepsTable(create?.options.stdin ?? '')).toEqual([zod]);
	});

	test('an open rolling issue is edited, never a second one filed', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: deps([honoNow]),
			run: rolling('OPEN', [zod, hono]),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out).toEqual([
			'updated https://github.com/softistx/nxgt-widget/issues/3',
		]);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
		const [edit] = callsOf(h.runner, 'gh', 'issue', 'edit', '3');
		expect(parseDepsTable(edit?.options.stdin ?? '')).toEqual([honoNow, zod]);
		expect(callsOf(h.runner, 'gh', 'issue', 'reopen')).toEqual([]);
	});

	test('a closed rolling issue is reopened with the new rows only', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: deps([honoNow]),
			run: rolling('CLOSED', [zod]),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out).toEqual([
			'reopened https://github.com/softistx/nxgt-widget/issues/3',
		]);
		const [edit] = callsOf(h.runner, 'gh', 'issue', 'edit', '3');
		expect(parseDepsTable(edit?.options.stdin ?? '')).toEqual([honoNow]);
		expect(callsOf(h.runner, 'gh', 'issue', 'reopen', '3')).toHaveLength(1);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});

	test('a reopened rolling issue loses the released label, so the next release does not read it as a failed fix', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: deps([honoNow]),
			run: rolling('CLOSED', [zod], ['dependencies', 'Released']),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		const unlabel = callsOf(h.runner, 'gh', 'issue', 'edit', '3').filter((c) =>
			c.argv.includes('--remove-label'),
		);
		expect(unlabel).toHaveLength(1);
		expect(unlabel[0]?.argv).toEqual(
			expect.arrayContaining(['--remove-label', 'released']),
		);
	});

	test('an open rolling issue, or a reopened one without the label, removes nothing', async () => {
		for (const [state, labels] of [
			['OPEN', ['dependencies', 'released']],
			['CLOSED', ['dependencies']],
		] as const) {
			const h = harness({
				cwd: makeApp(),
				stdin: deps([honoNow]),
				run: rolling(state, [zod], [...labels]),
			});
			await fileCommand(h.ctx, {});
			expect(
				callsOf(h.runner, 'gh', 'issue', 'edit').some((c) =>
					c.argv.includes('--remove-label'),
				),
			).toBe(false);
		}
	});

	test('nothing new: nothing written', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: deps([zod]),
			run: rolling('OPEN', [zod]),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out[0]).toMatch(/^unchanged /);
		expect(callsOf(h.runner, 'gh', 'issue', 'edit')).toEqual([]);
	});

	test('a private name in a row refuses', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: deps([{ name: '@acme/web', current: '1', latest: '2' }]),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});
});
