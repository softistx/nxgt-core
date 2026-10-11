import { afterAll, describe, expect, test } from 'bun:test';
import { fixedComment } from './issue-body';
import { type ReleaseOptions, releasePackage } from './release';
import {
	CHANGELOG,
	DIR,
	type Fake,
	fakeWorld,
	ghContext,
	PKG,
	REPO,
	type World,
} from './release.fixtures';
import { removeTempDirs } from './temp.fixtures';

afterAll(removeTempDirs);

const OWNERS = ['softistx', 'SteveGT96'];
const input = { repo: REPO, pkg: PKG, version: '1.4.0', dir: DIR };

const run = (fake: Fake, dryRun = false, over: Partial<ReleaseOptions> = {}) =>
	releasePackage(ghContext(fake), {
		...input,
		owners: OWNERS,
		dryRun,
		...over,
	});

const simple = (over: World = {}): World => ({
	log: [],
	prs: { 40: { closing: [12] } },
	issues: { 12: {} },
	...over,
});

describe('PR discovery', () => {
	test('the CHANGELOG section of the version, and only that one', async () => {
		const fake = fakeWorld(
			simple({ prs: { 40: { closing: [12] }, 30: { closing: [9] } } }),
		);
		const report = await run(fake);
		expect(report.prs).toEqual([40]);
		expect(report.issues.map((i) => i.number)).toEqual([12]);
	});

	test('first-parent log subjects since the previous tag name the PRs, with no files filter', async () => {
		const fake = fakeWorld(
			simple({
				log: [
					'Merge pull request #41 from softistx/fix-a',
					'fix: Another thing (#42)',
					'Merge pull request #43 from softistx/docs',
				],
				prs: {
					40: { closing: [12] },
					41: { body: 'Fixes #13', files: ['x'] },
					42: { body: 'Closes #14' },
					43: { body: 'Resolves softistx/nxgt-widget#15' },
				},
				issues: { 12: {}, 13: {}, 14: {}, 15: {} },
			}),
		);
		const report = await run(fake);
		expect(report.prs).toEqual([40, 41, 42, 43]);
		expect(report.issues.map((i) => i.number)).toEqual([12, 13, 14, 15]);
		const log = fake.calls.find((c) => c[0] === 'git' && c[1] === 'log');
		expect(log).toContain('--first-parent');
		expect(log).toContain('@nxgt/widget@1.3.0..@nxgt/widget@1.4.0');
		expect(log?.slice(-2)).toEqual(['--', DIR]);
	});

	test('a PR listed in the CHANGELOG that did not touch the package is dropped (git diff of its merge commit)', async () => {
		const fake = fakeWorld(
			simple({
				prs: {
					40: {
						closing: [12],
						mergeSha: 'm40',
						files: ['packages/other/a.ts'],
					},
				},
			}),
		);
		const report = await run(fake);
		expect(report.prs).toEqual([]);
		expect(report.issues).toEqual([]);
		const diff = fake.calls.find((c) => c[1] === 'diff');
		expect(diff).toEqual([
			'git',
			'diff',
			'--name-only',
			'm40^1',
			'm40',
			'--',
			DIR,
		]);
	});

	test('without the merge commit the PR files decide', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: { closing: [12], files: ['packages/other/a.ts'] } },
			}),
		);
		expect((await run(fake)).prs).toEqual([]);
	});

	test('the Version PR is not read for keywords', async () => {
		const fake = fakeWorld(
			simple({
				log: ['Merge pull request #45 from softistx/changeset-release/develop'],
				prs: {
					40: { closing: [12] },
					45: { head: 'changeset-release/develop', body: 'fixes #99' },
				},
				issues: { 12: {}, 99: {} },
			}),
		);
		expect((await run(fake)).issues.map((i) => i.number)).toEqual([12]);
	});

	test('closingIssuesReferences first, then the body regex; an issue of another repository is ignored', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: { closing: [12], body: 'Fixes #12, closes acme/other#3' } },
			}),
		);
		const report = await run(fake);
		expect(report.issues.map((i) => i.number)).toEqual([12]);
	});

	test('without a previous tag only the CHANGELOG counts, with a note', async () => {
		const fake = fakeWorld(simple({ tags: ['@nxgt/widget@1.4.0'] }));
		const report = await run(fake);
		expect(report.prs).toEqual([40]);
		expect(fake.calls.some((c) => c[1] === 'log')).toBe(false);
		expect(report.notes.join(' ')).toContain('no earlier tag');
	});

	test('a tag missing locally: the CHANGELOG alone is read, never a HEAD range', async () => {
		const fake = fakeWorld(simple({ tags: ['@nxgt/widget@1.3.0'] }));
		const report = await run(fake);
		expect(report.prs).toEqual([40]);
		expect(fake.calls.some((c) => c[1] === 'log')).toBe(false);
		expect(report.notes.join(' ')).toContain('not found');
	});

	test('a PR that cannot be read is a warning, the others go on', async () => {
		const fake = fakeWorld(
			simple({
				log: ['fix: Gone (#99)'],
				prs: { 40: { closing: [12] } },
			}),
		);
		const report = await run(fake);
		expect(report.issues.map((i) => i.number)).toEqual([12]);
		expect(report.warnings.join(' ')).toContain('#99');
	});
});

describe('a PR merged into an integration branch', () => {
	const world = () =>
		simple({
			prs: {
				40: {
					base: 'feat/thing',
					head: 'fix/slice',
					mergeSha: 'sha40',
					body: 'Closes #11',
				},
				50: { head: 'feat/thing', base: 'develop', body: 'Fixes #12' },
			},
			issues: { 11: {}, 12: {} },
		});

	test('the integration PR is found by its head branch, read, and named in the comment', async () => {
		const fake = fakeWorld(world());
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([
			[12, 50],
			[11, 50],
		]);
		expect(fake.world.issues[12]?.comments?.[0]?.body).toBe(
			fixedComment(PKG, '1.4.0', 50),
		);
		const list = fake.calls.find((c) => c[1] === 'pr' && c[2] === 'list');
		expect(list).toContain('feat/thing');
		expect(list).toContain('merged');
		expect(fake.calls.some((c) => c[1] === 'api')).toBe(false);
	});

	test('the integration PR itself, found in the first-parent log, counts once', async () => {
		const fake = fakeWorld({
			...world(),
			log: ['Merge pull request #50 from softistx/feat/thing'],
		});
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([
			[12, 50],
			[11, 50],
		]);
	});

	test('with no integration PR yet, the slice PR is named', async () => {
		const fake = fakeWorld({
			...world(),
			prs: { 40: world().prs?.[40] ?? {} },
		});
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([[11, 40]]);
	});

	test('a merged PR from the branch into another feat/* branch is not an integration PR', async () => {
		const fake = fakeWorld({
			...world(),
			prs: {
				...world().prs,
				50: { head: 'feat/thing', base: 'feat/outer', body: 'Fixes #12' },
			},
		});
		const report = await run(fake);
		expect(report.issues.map((i) => i.number)).toEqual([11]);
	});
});

describe('the issues', () => {
	test('comment, label and close; a second run writes nothing', async () => {
		const fake = fakeWorld(simple());
		const first = await run(fake);
		expect(first.issues[0]).toMatchObject({
			number: 12,
			pr: 40,
			commented: true,
			labelled: true,
			closed: true,
		});
		expect(fake.world.issues[12]?.state).toBe('CLOSED');
		expect(fake.world.issues[12]?.labels).toContain('released');
		const writesAfterFirst = fake.writes().length;
		expect(writesAfterFirst).toBe(3);

		const second = await run(fake);
		expect(fake.writes().length).toBe(writesAfterFirst);
		expect(second.issues[0]).toMatchObject({
			commented: false,
			labelled: false,
			closed: false,
		});
	});

	test('already closed: commented and labelled, not closed again', async () => {
		const fake = fakeWorld(simple({ issues: { 12: { state: 'CLOSED' } } }));
		const report = await run(fake);
		expect(report.issues[0]).toMatchObject({ commented: true, closed: false });
		expect(fake.writes().some((c) => c[2] === 'close')).toBe(false);
	});

	test('an identical comment from a trusted author is not posted again', async () => {
		const body = fixedComment(PKG, '1.4.0', 40);
		const fake = fakeWorld(
			simple({
				issues: {
					12: { comments: [{ login: 'steve', assoc: 'OWNER', body }] },
				},
			}),
		);
		const report = await run(fake);
		expect(report.issues[0]?.commented).toBe(false);
		expect(report.issues[0]?.labelled).toBe(true);
	});

	test('the release bot counts as trusted, a stranger copying the comment does not', async () => {
		const body = fixedComment(PKG, '1.4.0', 40);
		const bot = fakeWorld(
			simple({
				issues: {
					12: {
						comments: [{ login: 'github-actions', assoc: 'NONE', body }],
					},
				},
			}),
		);
		expect((await run(bot)).issues[0]?.commented).toBe(false);
		const stranger = fakeWorld(
			simple({
				issues: { 12: { comments: [{ login: 'eve', assoc: 'NONE', body }] } },
			}),
		);
		expect((await run(stranger)).issues[0]?.commented).toBe(true);
	});

	test('the hidden marker is the key: another PR number gives no second comment', async () => {
		const body = fixedComment(PKG, '1.4.0', 99);
		const fake = fakeWorld(
			simple({
				issues: {
					12: { comments: [{ login: 'steve', assoc: 'OWNER', body }] },
				},
			}),
		);
		const report = await run(fake);
		expect(report.issues[0]?.commented).toBe(false);
	});

	test('at most one comment ever: a marker for another package or version means done', async () => {
		const other = fixedComment('@nxgt/other', '2.0.0', 7);
		const closed = fakeWorld(
			simple({
				issues: {
					12: {
						state: 'CLOSED',
						labels: ['released'],
						comments: [{ login: 'github-actions', assoc: 'NONE', body: other }],
					},
				},
			}),
		);
		await run(closed);
		expect(closed.writes()).toEqual([]);
		const reopened = fakeWorld(
			simple({
				issues: {
					12: {
						comments: [
							{
								login: 'steve',
								assoc: 'OWNER',
								body: fixedComment(PKG, '1.0.0', 3),
							},
						],
					},
				},
			}),
		);
		const report = await run(reopened);
		expect(report.issues[0]).toMatchObject({
			commented: false,
			closed: false,
			reopened: true,
			labelled: true,
		});
		expect(reopened.writes().map((c) => c[2])).toEqual(['edit']);
		expect(report.notes.join(' ')).toContain('#12');
	});

	test('a stranger copying the marker does not count', async () => {
		const fake = fakeWorld(
			simple({
				issues: {
					12: {
						comments: [
							{
								login: 'eve',
								assoc: 'NONE',
								body: fixedComment('@nxgt/other', '2.0.0', 7),
							},
						],
					},
				},
			}),
		);
		expect((await run(fake)).issues[0]?.commented).toBe(true);
	});

	test('a reopened issue (marker present, issue open) is not closed again, with a note', async () => {
		const body = fixedComment(PKG, '1.4.0', 40);
		const fake = fakeWorld(
			simple({
				issues: {
					12: {
						state: 'OPEN',
						comments: [{ login: 'steve', assoc: 'OWNER', body }],
					},
				},
			}),
		);
		const report = await run(fake);
		expect(report.issues[0]).toMatchObject({
			closed: false,
			reopened: true,
			labelled: true,
		});
		expect(fake.writes().some((c) => c[2] === 'close')).toBe(false);
		expect(fake.world.issues[12]?.labels).toContain('released');
		expect(report.notes.join(' ')).toContain('#12');
	});

	test('keywords in code spans, fenced blocks and quotes close nothing', async () => {
		const fake = fakeWorld(
			simple({
				prs: {
					40: {
						body: 'Used `Fixes #14`.\n> Fixes #15\n```\nCloses #16\n```\nFixes #12',
					},
				},
				issues: { 12: {}, 14: {}, 15: {}, 16: {} },
			}),
		);
		expect((await run(fake)).issues.map((i) => i.number)).toEqual([12]);
	});

	test('a missing released label is created once, before it is used', async () => {
		const fake = fakeWorld(
			simple({
				repoLabels: ['bug'],
				prs: { 40: { closing: [12, 13] } },
				issues: { 12: {}, 13: {} },
			}),
		);
		const report = await run(fake);
		expect(report.labelCreated).toBe(true);
		const creates = fake.writes().filter((c) => c[1] === 'label');
		expect(creates.length).toBe(1);
		const created = fake.calls.indexOf(creates[0] as string[]);
		const edited = fake.calls.findIndex((c) => c[2] === 'edit');
		expect(created).toBeLessThan(edited);
	});

	test('an issue that cannot be read is a warning, the others go on', async () => {
		const fake = fakeWorld(
			simple({ prs: { 40: { closing: [12, 13] } }, issues: { 13: {} } }),
		);
		const report = await run(fake);
		expect(report.issues.map((i) => i.number)).toEqual([13]);
		expect(report.warnings.join(' ')).toContain('#12');
	});
});

describe('dry run', () => {
	test('reads, reports what it would do, writes nothing', async () => {
		const fake = fakeWorld(simple({ repoLabels: ['bug'] }));
		const report = await run(fake, true);
		expect(fake.writes()).toEqual([]);
		expect(report.dryRun).toBe(true);
		expect(report.labelCreated).toBe(true);
		expect(report.issues[0]).toMatchObject({
			commented: true,
			labelled: true,
			closed: true,
		});
		expect(fake.world.issues[12]?.state ?? 'OPEN').toBe('OPEN');
	});
});

describe('the notification list', () => {
	const upstream = (n: number) =>
		`Tracks it.\n\n<!-- nxgt-issues:upstream=softistx/nxgt-widget#${n} -->`;

	test('lists the tracking issues whose hidden marker names a released issue', async () => {
		const fake = fakeWorld(
			simple({
				tracking: [
					{
						repo: 'softistx/acme-store',
						number: 21,
						title: 'w',
						body: upstream(12),
					},
					{
						repo: 'softistx/acme-shop',
						number: 5,
						title: 'x',
						body: upstream(99),
					},
					{
						repo: 'softistx/acme-blog',
						number: 6,
						title: 'y',
						body: 'no marker',
					},
					{ repo: 'evil/app', number: 7, title: 'z', body: upstream(12) },
				],
			}),
		);
		const report = await run(fake);
		expect(report.notify).toEqual([
			{
				tracking: 'softistx/acme-store#21',
				title: 'w',
				url: 'https://github.com/softistx/acme-store/issues/21',
				upstream: 'softistx/nxgt-widget#12',
			},
		]);
	});

	test('a failing search is a warning and an empty list', async () => {
		const fake = fakeWorld({ ...simple(), failing: ['search issues'] });
		const report = await run(fake);
		expect(report.notify).toEqual([]);
		expect(report.warnings.join(' ')).toContain('tracking');
		expect(report.issues[0]?.closed).toBe(true);
	});

	test('no issue found: no search at all', async () => {
		const fake = fakeWorld(simple({ prs: { 40: {} } }));
		await run(fake);
		expect(fake.calls.some((c) => c[1] === 'search')).toBe(false);
	});
});

const versions = (...names: string[]) =>
	`Summary.\n\n## Versions\n\n${names.map((n) => `- \`${n}\` 1.0.0`).join('\n')}\n\n## Expected\n\nx\n`;
const SIBLINGS = [
	{ name: PKG, dir: DIR },
	{ name: '@nxgt/other', dir: 'packages/other' },
];
/** A fixing PR that touched the package and its sibling (a merge commit git can diff). */
const both = {
	mergeSha: 'm40',
	closing: [12],
	files: [`${DIR}/a.ts`, 'packages/other/b.ts'],
	changesets: ['@nxgt/other'],
};
const alone = { mergeSha: 'm40', closing: [12], files: [`${DIR}/a.ts`] };

describe('an issue that names another package of the repository', () => {
	test('is left to that package when the fixing PR also touched it: nothing written, a note, no notification', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: both },
				issues: { 12: { body: versions('@nxgt/other') } },
				tracking: [
					{
						repo: 'softistx/acme-store',
						number: 21,
						title: 'w',
						body: '<!-- nxgt-issues:upstream=softistx/nxgt-widget#12 -->',
					},
				],
			}),
		);
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(fake.writes()).toEqual([]);
		expect(report.issues[0]).toMatchObject({ skipped: true, commented: false });
		expect(report.notes.join(' ')).toContain('@nxgt/other');
		expect(report.notify).toEqual([]);
		expect(fake.calls.some((c) => c[1] === 'search')).toBe(false);
	});

	test('is handled when the PR touched the named package but adds no changeset naming it', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: { ...both, changesets: [] } },
				issues: { 12: { body: versions('@nxgt/other') } },
			}),
		);
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]?.skipped).toBe(false);
	});

	test('a slice issue is handled even when the integration PR touched the sibling through another slice', async () => {
		const fake = fakeWorld({
			...simple({
				prs: {
					41: {
						base: 'feat/x',
						head: 'fix/s41',
						closing: [12],
						mergeSha: 'm41',
						files: [`${DIR}/a.ts`],
					},
					42: {
						base: 'feat/x',
						head: 'fix/s42',
						mergeSha: 'm42',
						files: ['packages/other/b.ts'],
						changesets: ['@nxgt/other'],
					},
					40: {
						head: 'feat/x',
						mergeSha: 'm40',
						files: [`${DIR}/a.ts`, 'packages/other/b.ts'],
						changesets: ['@nxgt/other'],
					},
				},
				issues: { 12: { body: versions('@nxgt/other') } },
			}),
			changelog: CHANGELOG.replace('[#40]', '[#41]').replace(
				'- [#30]',
				'- [#42](https://x/pull/42) Also.\n\n- [#30]',
			),
		});
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]).toMatchObject({
			number: 12,
			pr: 40,
			skipped: false,
			commented: true,
		});
	});

	test('rank 0 + touched + changeset: skipped, and the sibling run comments later', async () => {
		const fake = fakeWorld({
			...simple({
				prs: { 40: both },
				issues: { 12: { body: versions('@nxgt/other') } },
			}),
			tags: [
				'@nxgt/widget@1.4.0',
				'@nxgt/widget@1.3.0',
				'@nxgt/other@1.4.0',
				'@nxgt/other@1.3.0',
			],
		});
		await run(fake, false, { siblings: SIBLINGS });
		expect(fake.writes()).toEqual([]);
		const later = await run(fake, false, {
			siblings: SIBLINGS,
			pkg: '@nxgt/other',
			dir: 'packages/other',
		});
		expect(later.issues[0]).toMatchObject({
			number: 12,
			commented: true,
			skipped: false,
		});
	});

	test('is handled under this package when the fixing PR did not touch the named one', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: alone },
				issues: { 12: { body: versions('@nxgt/other') } },
			}),
		);
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]).toMatchObject({
			skipped: false,
			commented: true,
			closed: true,
		});
	});

	test('is handled when git cannot say whether the named package was touched', async () => {
		const fake = fakeWorld(
			simple({
				prs: { 40: { closing: [12] } },
				issues: { 12: { body: versions('@nxgt/other') } },
			}),
		);
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]?.skipped).toBe(false);
	});

	test('is released when the Versions section names this package, or only packages of other repositories', async () => {
		for (const body of [
			versions('@nxgt/other', PKG),
			versions('@acme/elsewhere'),
			'no versions section',
		]) {
			const fake = fakeWorld(
				simple({ prs: { 40: both }, issues: { 12: { body } } }),
			);
			const report = await run(fake, false, { siblings: SIBLINGS });
			expect(report.issues[0]?.commented).toBe(true);
		}
	});

	test('a Versions section inside a fenced block is not read', async () => {
		const body = `Report.\n\n\`\`\`\n${versions('@nxgt/other')}\`\`\`\n`;
		const fake = fakeWorld(
			simple({ prs: { 40: both }, issues: { 12: { body } } }),
		);
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]?.skipped).toBe(false);
	});
});

describe('the marker is written last', () => {
	test('a close that fails once leaves no marker: the next run closes and comments, with no reopened note', async () => {
		const fake = fakeWorld({ ...simple(), failOnce: ['issue close'] });
		const first = await run(fake);
		expect(first.warnings.join(' ')).toContain('#12');
		expect(fake.world.issues[12]?.comments ?? []).toEqual([]);
		expect(fake.world.issues[12]?.labels).toContain('released');
		const second = await run(fake);
		expect(second.issues[0]).toMatchObject({
			commented: true,
			closed: true,
			reopened: false,
		});
		expect(second.notes.join(' ')).not.toContain('reopened');
		expect(fake.world.issues[12]?.state).toBe('CLOSED');
		const order = fake.writes().map((c) => c[2]);
		expect(order.slice(-2)).toEqual(['close', 'comment']);
	});
});

describe('a failed integration lookup', () => {
	test('keeps the slice PR issues, named after the slice, with a warning', async () => {
		const fake = fakeWorld({
			...simple({
				prs: {
					40: { base: 'feat/thing', head: 'fix/slice', body: 'Closes #12' },
				},
			}),
			failing: ['pr list'],
		});
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([[12, 40]]);
		expect(report.warnings.join(' ')).toContain('feat/thing');
	});
});

describe('a package at the repository root', () => {
	const root = { dir: '.' };
	const world = () =>
		fakeWorld({
			...simple({
				prs: { 40: { closing: [12], mergeSha: 'm40', files: ['src/a.ts'] } },
			}),
			tags: ['v1.4.0', 'v1.3.0'],
		});

	test('single-package tags (v1.4.0), the whole tree as the path, the root CHANGELOG', async () => {
		const fake = world();
		const report = await run(fake, false, root);
		expect(report.issues[0]).toMatchObject({ number: 12, closed: true });
		const log = fake.calls.find((c) => c[1] === 'log');
		expect(log).toContain('v1.3.0..v1.4.0');
		expect(log?.slice(-2)).toEqual(['--', '.']);
		const show = fake.calls.find((c) => c[1] === 'show');
		expect(show?.[2]).toEndWith(':CHANGELOG.md');
		expect(fake.calls.find((c) => c[1] === 'diff')?.slice(-2)).toEqual([
			'--',
			'.',
		]);
	});

	test('the name@version tag style works too', async () => {
		const fake = fakeWorld(
			simple({ prs: { 40: { closing: [12], files: ['src/a.ts'] } } }),
		);
		const report = await run(fake, false, root);
		expect(report.issues[0]?.closed).toBe(true);
		expect(fake.calls.find((c) => c[1] === 'log')).toContain(
			'@nxgt/widget@1.3.0..@nxgt/widget@1.4.0',
		);
	});
});

describe('an integration PR credited to a slice that did not touch the package', () => {
	const slice = (n: number, over: object = {}) => ({
		base: 'feat/x',
		head: `fix/s${n}`,
		mergeSha: `m${n}`,
		...over,
	});
	/** Slice 42 only adds a changeset; integration PR 40 holds the fix, touching both packages. */
	const world = (over: World = {}): World => ({
		...simple({
			prs: {
				41: slice(41, { files: [`${DIR}/a.ts`] }),
				42: slice(42, {
					files: ['.changeset/c.md'],
					changesets: [PKG, '@nxgt/other'],
				}),
				40: {
					head: 'feat/x',
					mergeSha: 'm40',
					closing: [12],
					files: [`${DIR}/a.ts`, 'packages/other/b.ts'],
					changesets: [PKG, '@nxgt/other'],
				},
			},
			issues: { 12: { body: versions('@nxgt/other') } },
			log: ['Merge pull request #40 from softistx/feat/x'],
		}),
		changelog: CHANGELOG.replace('[#40]', '[#42]'),
		...over,
	});
	const otherTags = ['@nxgt/other@1.4.0', '@nxgt/other@1.3.0'];
	const widgetTags = ['@nxgt/widget@1.4.0', '@nxgt/widget@1.3.0'];

	test('an integration PR whose merge did not touch the package is left out', async () => {
		const w = world({ tags: widgetTags, log: [] });
		w.prs = {
			...w.prs,
			40: { ...w.prs?.[40], files: ['packages/other/b.ts'] },
		};
		const report = await run(fakeWorld(w));
		expect(report.issues.map((i) => i.number)).not.toContain(12);
	});

	test('a first release finds the integration PR own issue through the listed slice', async () => {
		const fake = fakeWorld(world({ tags: ['@nxgt/widget@1.4.0'] }));
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([[12, 40]]);
		expect(report.issues[0]?.commented).toBe(true);
	});

	test('the sibling has no earlier tag: the issue is handled on run 1', async () => {
		const fake = fakeWorld(world({ tags: widgetTags }));
		const report = await run(fake, false, { siblings: SIBLINGS });
		expect(report.issues[0]).toMatchObject({ skipped: false, commented: true });
	});

	test('the sibling has an earlier tag: skipped, then the sibling run comments', async () => {
		const fake = fakeWorld(world({ tags: [...widgetTags, ...otherTags] }));
		const first = await run(fake, false, { siblings: SIBLINGS });
		expect(first.issues[0]?.skipped).toBe(true);
		expect(fake.writes()).toEqual([]);
		const later = await run(fake, false, {
			siblings: SIBLINGS,
			pkg: '@nxgt/other',
			dir: 'packages/other',
		});
		expect(later.issues[0]).toMatchObject({
			number: 12,
			pr: 40,
			commented: true,
		});
	});

	test.each(['--diff-filter=A', 'm40:.changeset', 'm40^1'])(
		'when git cannot say (%s fails), the issue is handled under the released package',
		async (needle) => {
			const fake = fakeWorld(
				world({ tags: [...widgetTags, ...otherTags], failing: [needle] }),
			);
			const report = await run(fake, false, { siblings: SIBLINGS });
			expect(report.issues[0]).toMatchObject({
				skipped: false,
				commented: true,
			});
		},
	);
});

describe('a feat/* branch that was merged before', () => {
	/** Slice 42 into feat/x is listed; #30 merged feat/x in the earlier release (fixing #9), #50 merges it now. */
	const world = (old: object = { shipped: true }, over: World = {}): World => ({
		...simple({
			prs: {
				42: {
					base: 'feat/x',
					head: 'fix/s42',
					mergeSha: 'm42',
					mergedAt: '2026-10-05T00:00:00Z',
					files: [`${DIR}/a.ts`],
				},
				30: {
					head: 'feat/x',
					mergeSha: 'm30',
					mergedAt: '2026-09-01T00:00:00Z',
					closing: [9],
					files: [`${DIR}/a.ts`],
					...old,
				},
				50: {
					head: 'feat/x',
					mergeSha: 'm50',
					mergedAt: '2026-10-06T00:00:00Z',
					closing: [12],
					files: [`${DIR}/a.ts`],
				},
			},
			issues: { 12: {}, 9: {} },
			log: [],
		}),
		changelog: CHANGELOG.replace('[#40]', '[#42]'),
		...over,
	});
	const numbers = async (w: World) =>
		(await run(fakeWorld(w))).issues.map((i) => i.number);

	test('an integration PR released before is dropped (its merge is an ancestor of the previous tag)', async () => {
		expect(await numbers(world())).toEqual([12]);
	});

	test('without a previous tag, the older merge is dropped by its date', async () => {
		const w = world({ shipped: false }, { tags: ['@nxgt/widget@1.4.0'] });
		expect(await numbers(w)).toEqual([12]);
	});

	test('when git cannot say, the older merge is dropped by its date', async () => {
		const w = world({ shipped: false }, { failing: ['merge-base'] });
		expect(await numbers(w)).toEqual([12]);
	});

	test('a merge not yet released is kept', async () => {
		const w = world({ shipped: false, mergedAt: '2026-10-07T00:00:00Z' });
		expect((await numbers(w)).sort()).toEqual([12, 9]);
	});

	test('"not an ancestor" beats the date: an old merge git says is unreleased is kept', async () => {
		const w = world({ shipped: false });
		expect((await numbers(w)).sort()).toEqual([12, 9]);
	});

	describe('with no previous tag, the date is each slice own', () => {
		const slice = (n: number, mergedAt: string) => ({
			base: 'feat/x',
			head: `fix/s${n}`,
			mergeSha: `m${n}`,
			mergedAt,
			files: [`${DIR}/a.ts`],
		});
		const merge = (sha: string, mergedAt: string, closing: number[]) => ({
			head: 'feat/x',
			mergeSha: sha,
			mergedAt,
			closing,
			files: [`${DIR}/a.ts`],
		});
		/** Slices 41 (09-20) and 42 (10-05) are listed in the given order; #30 (09-25) merged feat/x before #42 but after #41. */
		const ordered = (listed: number[]): World => ({
			...simple({
				prs: {
					41: slice(41, '2026-09-20T00:00:00Z'),
					42: slice(42, '2026-10-05T00:00:00Z'),
					30: merge('m30', '2026-09-25T00:00:00Z', [9]),
					50: merge('m50', '2026-10-06T00:00:00Z', [12]),
				},
				issues: { 12: {}, 9: {} },
			}),
			tags: ['@nxgt/widget@1.4.0'],
			changelog: CHANGELOG.replace(
				/- \[#40\].*/,
				listed
					.map(
						(n) =>
							`- [#${n}](https://github.com/softistx/nxgt-widget/pull/${n}) Thing.`,
					)
					.join('\n'),
			),
		});

		test.each([[[41, 42]], [[42, 41]]])(
			'slices listed as %p give the same result',
			async (listed) => {
				expect((await numbers(ordered(listed))).sort()).toEqual([12, 9]);
			},
		);
	});
});
