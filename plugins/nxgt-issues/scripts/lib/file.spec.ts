import { afterAll, describe, expect, test } from 'bun:test';
import {
	callsOf,
	harness,
	makeApp,
	PKG,
	removeTempDirs,
	report,
} from './cli.fixtures';

afterAll(removeTempDirs);

import { EXIT } from './cli-context';
import { fileCommand, searchQuery } from './file';
import { fingerprint, fingerprintMarker } from './fingerprint';

const issue = (number: number, body: string, state = 'OPEN') => ({
	number,
	title: `issue ${number}`,
	state,
	url: `https://github.com/softistx/nxgt-widget/issues/${number}`,
	body,
});

const FP = fingerprint(PKG, 'bug', 'parse drops the last item of a list');

describe('file: a new report', () => {
	test('creates the labels, files the scrubbed body and prints the URL', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report({ repro: 'Fails in /Users/jroe/work/x/src/a.ts at load.' }),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out).toEqual([
			'filed https://github.com/softistx/nxgt-widget/issues/12',
		]);
		const [create] = callsOf(h.runner, 'gh', 'issue', 'create');
		expect(create?.argv).toEqual(
			expect.arrayContaining(['--label', 'bug,consumer-report']),
		);
		const body = create?.options.stdin ?? '';
		expect(body).toContain(fingerprintMarker(FP));
		expect(body).toContain('<app>/…');
		expect(body).not.toContain('jroe');
		const labels = callsOf(h.runner, 'gh', 'label', 'create').map(
			(c) => c.argv[3],
		);
		expect(labels).toEqual(['consumer-report']);
	});

	test('one search call at most, built from the keywords', async () => {
		const h = harness({ cwd: makeApp(), stdin: report() });
		await fileCommand(h.ctx, {});
		const searches = callsOf(
			h.runner,
			'gh',
			'issue',
			'list',
			'--state',
			'open',
		);
		expect(searches).toHaveLength(1);
		expect(searches[0]?.argv).toContain('parse last item');
	});

	test('searchQuery keeps at most six plain words', () => {
		expect(searchQuery('a "parse()" drops, the last item of lists x')).toBe(
			'parse drops the last item lists',
		);
	});
});

describe('file: the rendered texts are scrubbed', () => {
	test.each([
		['title', { title: 'acme-store crashes in parse' }],
		['summary', { summary: 'Seen in AcmeStore checkout.' }],
		['expected', { expected: 'Works as in secret-crm.' }],
		['actual', { actual: 'Jane Roe saw it fail.' }],
		['repro', { repro: 'ssh janes-laptop and run it' }],
		['workaround', { workaround: 'We patched @acme/web.' }],
		['versions', { versions: { '@acme/web': '1.0.0' } }],
		['keywords', { keywords: ['acme'] }],
		['note (the duplicate comment)', { note: 'also in acme_store' }],
		['an extra term from the env', { summary: 'the Gizmo flow' }],
	])('a private name in %s refuses with nothing written', async (_, over) => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(over),
			env: { NXGT_ISSUES_DENY_TERMS: 'gizmo' },
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		expect(h.out[0]).toContain('refused');
		expect(h.out.join('\n')).toContain('remove these terms');
		const writes = h.runner.calls.filter((c) =>
			['create', 'comment', 'edit'].includes(c.argv[2] ?? ''),
		);
		expect(writes).toEqual([]);
		expect(callsOf(h.runner, 'gh', 'issue', 'list')).toEqual([]);
	});

	test('a credential refuses by its keyword, never its value', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report({ workaround: 'set password: hunter2 in the config' }),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		const text = h.out.join('\n');
		expect(text).toContain('password');
		expect(text).not.toContain('hunter2');
	});

	test('the package and its repository may be named', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report({
				summary: 'In @nxgt/widget (softistx/nxgt-widget, nxgt-widget).',
			}),
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
	});
});

describe('file: dedupe', () => {
	test('the same fingerprint comments as another consumer', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report({ note: 'Also with bun 1.3.2.' }),
			run: [
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
						'consumer-report',
					],
					result: {
						stdout: JSON.stringify([
							issue(7, `x\n${fingerprintMarker(FP)}`, 'CLOSED'),
						]),
					},
				},
			],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.ok);
		expect(h.out[0]).toMatch(
			/^commented .*#issuecomment-1 \(duplicate of #7, closed\)$/,
		);
		const [comment] = callsOf(h.runner, 'gh', 'issue', 'comment', '7');
		expect(comment?.options.stdin).toContain('Another consumer hit this.');
		expect(comment?.options.stdin).toContain('Also with bun 1.3.2.');
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
		expect(callsOf(h.runner, 'gh', 'issue', 'list', '--state', 'open')).toEqual(
			[],
		);
	});

	const candidates = [
		{
			argv: ['gh', 'issue', 'list', '--state', 'open'],
			result: { stdout: JSON.stringify([issue(9, 'parse is lossy')]) },
		},
	];

	test('keyword candidates are printed for Claude to judge', async () => {
		const h = harness({ cwd: makeApp(), stdin: report(), run: candidates });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.candidates);
		expect(h.out.join('\n')).toContain('#9 issue 9');
		expect(h.out.join('\n')).toContain('--duplicate-of');
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});

	test('--duplicate-of comments on the issue Claude chose', async () => {
		const h = harness({ cwd: makeApp(), stdin: report(), run: candidates });
		expect(await fileCommand(h.ctx, { duplicateOf: 9 })).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'comment', '9')).toHaveLength(1);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toEqual([]);
	});

	test('--new files although candidates exist, without searching', async () => {
		const h = harness({ cwd: makeApp(), stdin: report(), run: candidates });
		expect(await fileCommand(h.ctx, { force: true })).toBe(EXIT.ok);
		expect(callsOf(h.runner, 'gh', 'issue', 'list', '--state', 'open')).toEqual(
			[],
		);
		expect(callsOf(h.runner, 'gh', 'issue', 'create')).toHaveLength(1);
	});
});

describe('file: refusals and failures', () => {
	test('a gate refusal files nothing', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [
				{
					argv: ['gh', 'api', 'repos/softistx/nxgt-widget'],
					result: {
						stdout: JSON.stringify({
							full_name: 'softistx/nxgt-widget',
							has_issues: false,
						}),
					},
				},
			],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedGate);
		expect(h.out[0]).toBe(
			'refused: issues-disabled (softistx/nxgt-widget); nothing was filed.',
		);
		expect(callsOf(h.runner, 'gh', 'issue')).toEqual([]);
	});

	test('an invalid report is a usage error', async () => {
		const h = harness({ cwd: makeApp(), stdin: '{"kind":"bug"}' });
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.usage);
		expect(h.err.join('\n')).toContain('"package"');
		expect(h.runner.calls).toEqual([]);
	});

	test('a rate limit stops the run and the next one makes no gh call', async () => {
		const cwd = makeApp();
		const limited = {
			argv: ['gh', 'issue', 'list'],
			result: { code: 1, stderr: 'API rate limit exceeded' },
		};
		const first = harness({ cwd, stdin: report(), run: [limited] });
		expect(await fileCommand(first.ctx, {})).toBe(EXIT.rateLimited);
		expect(first.out[0]).toMatch(/^rate-limited: /);
		const before = first.runner.calls.length;
		expect(await fileCommand(first.ctx, {})).toBe(EXIT.rateLimited);
		const gh = first.runner.calls
			.slice(before)
			.filter((c) => c.argv[0] === 'gh');
		expect(gh).toEqual([]);
	});

	test('no private-repository list and no cache: refused', async () => {
		const h = harness({
			cwd: makeApp(),
			stdin: report(),
			run: [
				{
					argv: ['gh', 'repo', 'list'],
					result: { code: 1, stderr: 'not logged in' },
				},
			],
		});
		expect(await fileCommand(h.ctx, {})).toBe(EXIT.refusedScrub);
		expect(h.out[0]).toContain("cannot list the owners' private repositories");
		expect(callsOf(h.runner, 'gh', 'issue')).toEqual([]);
	});
});
