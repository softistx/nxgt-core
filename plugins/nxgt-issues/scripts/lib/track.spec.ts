import { describe, expect, test } from 'bun:test';
import { callsOf, harness, makeApp, PKG } from './cli.fixtures';
import { EXIT } from './cli-context';
import { trackingIssueBody } from './issue-body';
import { upstreamMarker } from './refs';
import { trackCommand } from './track';

const APP_API = ['gh', 'api', 'repos/softistx/acme-store'];
const appRepo = (over: Record<string, unknown> = {}) => ({
	argv: APP_API,
	result: {
		stdout: JSON.stringify({
			full_name: 'softistx/acme-store',
			has_issues: true,
			archived: false,
			private: true,
			...over,
		}),
	},
});
const GREP = {
	argv: ['git', 'grep'],
	result: {
		stdout: [
			'src/a.ts:12:// Temporary, until @nxgt/widget#12',
			'src/b.ts:3:// Temporary, until softistx/nxgt-widget#12',
			'src/c.ts:9:// Temporary, until @nxgt/widget#99',
		].join('\n'),
	},
};
const input = (over: Record<string, unknown> = {}) =>
	JSON.stringify({
		upstream: 'softistx/nxgt-widget#12',
		package: PKG,
		title: 'parse drops the last item',
		summary: 'We append a comma meanwhile.',
		...over,
	});
const upstream = {
	repo: { owner: 'softistx', repo: 'nxgt-widget' },
	number: 12,
};

describe('track', () => {
	test('opens the tracking issue with the marker and the markers found', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: input(),
			run: [appRepo(), GREP],
		});
		expect(await trackCommand(h.ctx)).toBe(EXIT.ok);
		expect(h.out[0]).toBe(
			'tracking https://github.com/softistx/nxgt-widget/issues/12 (2 marker(s))',
		);
		const [create] = callsOf(h.runner, 'gh', 'issue', 'create');
		expect(create?.argv).toEqual(
			expect.arrayContaining([
				'-R',
				'softistx/acme-store',
				'--label',
				'upstream',
				'--title',
				'Upstream @nxgt/widget#12: parse drops the last item',
			]),
		);
		const body = create?.options.stdin ?? '';
		expect(body).toContain(upstreamMarker(upstream));
		expect(body).toContain('`src/a.ts:12`');
		expect(body).toContain('`src/b.ts:3`');
		expect(body).not.toContain('src/c.ts');
		expect(
			callsOf(h.runner, 'gh', 'label', 'create').map((c) => c.argv[3]),
		).toEqual(['upstream']);
	});

	test('markers given in the input are used as they are', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: input({ markers: [{ file: 'x.ts', line: 1 }] }),
			run: [appRepo()],
		});
		expect(await trackCommand(h.ctx)).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'git', 'grep')).toEqual([]);
	});

	test('an existing tracking issue is refreshed, not duplicated', async () => {
		const old = trackingIssueBody({
			upstream,
			packageName: PKG,
			summary: 'old',
			markers: [],
		});
		const h = harness({
			cwd: makeApp(),
			stdin: input(),
			run: [
				appRepo(),
				GREP,
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
						'upstream',
					],
					result: {
						stdout: JSON.stringify([
							{
								number: 40,
								title: 't',
								state: 'OPEN',
								url: 'https://github.com/softistx/acme-store/issues/40',
								body: old,
							},
						]),
					},
				},
			],
		});
		expect(await trackCommand(h.ctx)).toBe(EXIT.ok);
		expect(h.out[0]).toBe(
			'tracking https://github.com/softistx/acme-store/issues/40 (2 marker(s))',
		);
		expect(callsOf(h.runner, 'gh', 'issue', 'edit', '40')).toHaveLength(1);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});

	test('a public application repository is refused', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: input(),
			run: [appRepo({ private: false })],
		});
		expect(await trackCommand(h.ctx)).toBe(EXIT.refusedGate);
		expect(h.out[0]).toContain('is public');
		expect(callsOf(h.runner, 'gh', 'issue')).toEqual([]);
	});

	test("an application outside the owners' is refused with no gh call", async () => {
		const h = harness({
			cwd: makeApp('https://github.com/someone/shop.git'),
			stdin: input(),
		});
		expect(await trackCommand(h.ctx)).toBe(EXIT.refusedGate);
		expect(h.runner.calls).toEqual([]);
	});

	test.each([
		'nope',
		'{"upstream":"#12","package":"x","title":"t","summary":"s"}',
		'{"upstream":"o/r#1"}',
	])('invalid input %p is a usage error', async (stdin) => {
		const h = harness({ cwd: makeApp(), stdin });
		expect(await trackCommand(h.ctx)).toBe(EXIT.usage);
	});
});
