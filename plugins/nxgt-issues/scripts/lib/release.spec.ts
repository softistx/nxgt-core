import { afterAll, describe, expect, test } from 'bun:test';
import { fixedComment } from './issue-body';
import { releasePackage } from './release';
import {
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

const run = (fake: Fake, dryRun = false) =>
	releasePackage(ghContext(fake), { ...input, owners: OWNERS, dryRun });

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

	test('git log merge and squash subjects since the previous tag, filtered to PRs touching the package', async () => {
		const fake = fakeWorld(
			simple({
				log: [
					'Merge pull request #41 from softistx/fix-a',
					'fix: Another thing (#42)',
					'Merge pull request #43 from softistx/docs',
				],
				prs: {
					40: { closing: [12] },
					41: { body: 'Fixes #13', files: ['packages/other/a.ts'] },
					42: { body: 'Closes #14' },
					43: { body: 'Resolves softistx/nxgt-widget#15', files: [`${DIR}/x`] },
				},
				issues: { 12: {}, 13: {}, 14: {}, 15: {} },
			}),
		);
		const report = await run(fake);
		expect(report.prs).toEqual([40, 42, 43]);
		expect(report.issues.map((i) => i.number)).toEqual([12, 14, 15]);
		const log = fake.calls.find((c) => c[0] === 'git' && c[1] === 'log');
		expect(log).toContain('@nxgt/widget@1.3.0..@nxgt/widget@1.4.0');
		expect(log?.slice(-2)).toEqual(['--', DIR]);
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

	test('a tag not created yet: the range ends at HEAD, from the latest tag', async () => {
		const fake = fakeWorld(simple({ tags: ['@nxgt/widget@1.3.0'] }));
		await run(fake);
		const log = fake.calls.find((c) => c[1] === 'log');
		expect(log).toContain('@nxgt/widget@1.3.0..HEAD');
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
				40: { base: 'feat/thing', mergeSha: 'sha40', body: 'Closes #11' },
				50: { base: 'develop', body: 'Fixes #12' },
			},
			commitPulls: {
				sha40: [
					{ number: 40, base: 'feat/thing', merged: true },
					{ number: 50, base: 'develop', merged: true },
					{ number: 51, base: 'develop', merged: false },
				],
			},
			issues: { 11: {}, 12: {} },
		});

	test('the integration PR that contains its commit is read too, and named in the comment', async () => {
		const fake = fakeWorld(world());
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([
			[12, 50],
			[11, 50],
		]);
		expect(fake.world.issues[12]?.comments?.[0]?.body).toBe(
			fixedComment(PKG, '1.4.0', 50),
		);
	});

	test('with no integration PR yet, the slice PR is named', async () => {
		const fake = fakeWorld({ ...world(), commitPulls: {} });
		const report = await run(fake);
		expect(report.issues.map((i) => [i.number, i.pr])).toEqual([[11, 40]]);
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
