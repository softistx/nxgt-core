import { afterAll, describe, expect, test } from 'bun:test';
import { grep, NOW, seeded } from './app-side.fixtures';
import { main } from './cli';
import { callsOf, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { GRAPHQL } from './session.fixtures';

afterAll(removeTempDirs);

const WIDGET = 'src/a.ts:1:// Temporary, until @nxgt/widget#';
const WIDGET_REPO = 'repos/softistx/nxgt-widget';
const APP_REPO = 'repos/softistx/acme-store';

const upstream = (state: string, labels: string[], comment?: string) => ({
	argv: GRAPHQL,
	result: {
		stdout: JSON.stringify({
			data: {
				u0: {
					issue: {
						state,
						labels: { nodes: labels.map((name) => ({ name })) },
						comments: {
							nodes: comment
								? [
										{
											body: comment,
											authorAssociation: 'NONE',
											author: { login: 'github-actions[bot]' },
										},
									]
								: [],
						},
					},
				},
			},
		}),
	},
});

const publicApp = {
	argv: ['gh', 'api', APP_REPO],
	result: {
		stdout: JSON.stringify({
			full_name: 'softistx/acme-store',
			has_issues: true,
			archived: false,
			private: false,
		}),
	},
};

describe('markers: transient failures are not "unresolvable"', () => {
	test('a rate limit exits 5', async () => {
		const h = seeded({
			run: [
				{
					argv: ['gh', 'api', WIDGET_REPO],
					result: { code: 1, stderr: 'HTTP 429 rate limit exceeded' },
				},
				grep(`${WIDGET}12\n`),
			],
		});
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.rateLimited);
		expect(h.out.join('\n')).not.toContain('unresolvable');
	});

	test('a gh failure exits 6', async () => {
		const h = seeded({
			run: [
				{
					argv: ['gh', 'api', WIDGET_REPO],
					result: { code: 1, stderr: 'HTTP 502 bad gateway' },
				},
				grep(`${WIDGET}12\n`),
			],
		});
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.failed);
		expect(h.out.join('\n')).not.toContain('unresolvable');
	});
});

describe('markers: a public application has no tracking issues', () => {
	test('reads the upstream state directly: closed and released is ready', async () => {
		const h = seeded(
			{
				run: [
					publicApp,
					upstream(
						'CLOSED',
						['released'],
						'Fixed in @nxgt/widget@1.4.0 (#40).',
					),
					grep(`${WIDGET}77\n`),
				],
			},
			[],
		);
		expect(await main(h.ctx, ['markers', '--json'])).toBe(EXIT.flagged);
		const [report] = JSON.parse(h.out.join('\n'));
		expect(report).toMatchObject({ status: 'ready', version: '1.4.0' });
		const query =
			callsOf(h.runner, 'gh', 'api', 'graphql')[0]?.argv.join(' ') ?? '';
		expect(query).toContain('repository(owner:"softistx",name:"nxgt-widget")');
		expect(query).toContain('issue(number:77)');
	});

	test('open or closed-not-released waits; untracked is a note, not a flag', async () => {
		const h = seeded(
			{ run: [publicApp, upstream('OPEN', ['bug']), grep(`${WIDGET}77\n`)] },
			[],
		);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.ok);
		expect(h.out[0]).toContain('waiting @nxgt/widget#77');
		expect(h.out[0]).toContain('no open tracking issue');
	});

	test('a private application still flags it as untracked, with no lookup', async () => {
		const h = seeded({ run: [grep(`${WIDGET}77\n`)] }, []);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.flagged);
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toEqual([]);
	});

	test('a number past the 32-bit cap is unresolvable and never queried', async () => {
		const h = seeded({ run: [publicApp, grep(`${WIDGET}99999999999\n`)] }, []);
		expect(await main(h.ctx, ['markers'])).toBe(EXIT.flagged);
		expect(h.out[0]).toContain('unresolvable');
		expect(callsOf(h.runner, 'gh', 'api', 'graphql')).toEqual([]);
	});
});

describe('markers --exclude', () => {
	test('is passed to git grep as an exclude pathspec, repeatable', async () => {
		const h = seeded({ run: [grep('', 1)], now: NOW });
		expect(
			await main(h.ctx, [
				'markers',
				'--exclude',
				'docs',
				'--exclude',
				'**/*.fixtures.ts',
			]),
		).toBe(EXIT.ok);
		const argv = callsOf(h.runner, 'git', 'grep')[0]?.argv ?? [];
		expect(argv.slice(-3)).toEqual([
			'--',
			':(exclude)docs',
			':(exclude)**/*.fixtures.ts',
		]);
	});

	test('a missing value is a usage error', async () => {
		const h = seeded({});
		expect(await main(h.ctx, ['markers', '--exclude'])).toBe(EXIT.usage);
	});
});
