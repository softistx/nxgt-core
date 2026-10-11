import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeReleasedIssues, type Exec } from './close-released-issues';

// Self-contained on purpose: this file is copied with the script into each
// library repository, where nothing of the plugin exists.

const dirs: string[] = [];
const tempDir = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'nxgt-issues-release-'));
	dirs.push(dir);
	return dir;
};
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const REPO = 'softistx/nxgt-widget';
const PUBLISHED = JSON.stringify([{ name: '@nxgt/widget', version: '1.4.0' }]);
const COMMENT =
	'Fixed in @nxgt/widget@1.4.0 (#40).\n\n<!-- nxgt-issues:fixed=@nxgt/widget@1.4.0 -->\n';

const CHANGELOG = [
	'# @nxgt/widget',
	'',
	'## 1.4.0',
	'',
	'- [#40](https://github.com/softistx/nxgt-widget/pull/40) Adds a thing.',
	'',
	'## 1.3.0',
	'',
	'- [#30](https://github.com/softistx/nxgt-widget/pull/30) Older.',
].join('\n');

interface Pr {
	base?: string;
	body?: string;
	closing?: number[];
	files?: string[];
	sha?: string;
}
interface Issue {
	state: string;
	labels: string[];
	comments: { login: string; assoc: string; body: string }[];
}
interface World {
	log?: string[];
	prs?: Record<number, Pr>;
	pulls?: Record<string, { number: number; base: string; merged: boolean }[]>;
	issues?: Record<number, Partial<Issue>>;
	labels?: string[];
}

function fakeWorld(init: World) {
	const labels = init.labels ?? ['released'];
	const issues: Record<number, Issue> = {};
	for (const [n, i] of Object.entries(init.issues ?? {})) {
		issues[Number(n)] = { state: 'OPEN', labels: [], comments: [], ...i };
	}
	const writes: string[][] = [];
	const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
	const bad = (stderr: string) => ({ code: 1, stdout: '', stderr });
	const exec: Exec = async (argv, stdin) => {
		const [tool, a, b, c] = argv;
		const n = Number(c ?? b);
		if (tool === 'git' && a === 'tag') {
			return ok('@nxgt/widget@1.4.0\n@nxgt/widget@1.3.0\n');
		}
		if (tool === 'git' && a === 'log')
			return ok(`${(init.log ?? []).join('\n')}\n`);
		if (tool === 'git' && a === 'show') return ok(CHANGELOG);
		if (a === 'pr' && b === 'view') {
			const pr = init.prs?.[Number(c)];
			if (!pr) return bad('no pull request found');
			return ok(
				JSON.stringify({
					baseRefName: pr.base ?? 'develop',
					body: pr.body ?? '',
					closingIssuesReferences: (pr.closing ?? []).map((number) => ({
						number,
						repository: { name: 'nxgt-widget', owner: { login: 'softistx' } },
					})),
					mergeCommit: pr.sha ? { oid: pr.sha } : null,
					files: (pr.files ?? ['packages/widget/src/a.ts']).map((path) => ({
						path,
					})),
				}),
			);
		}
		if (a === 'api') {
			const sha = /commits\/(\w+)\/pulls$/.exec(String(b))?.[1] ?? '';
			return ok(
				JSON.stringify(
					(init.pulls?.[sha] ?? []).map((p) => ({
						number: p.number,
						base: { ref: p.base },
						merged_at: p.merged ? '2026-10-01T00:00:00Z' : null,
					})),
				),
			);
		}
		if (a === 'issue' && b === 'view') {
			const issue = issues[n];
			if (!issue) return bad('Could not resolve to an Issue');
			return ok(
				JSON.stringify({
					state: issue.state,
					labels: issue.labels.map((name) => ({ name })),
					comments: issue.comments.map((x) => ({
						author: { login: x.login },
						authorAssociation: x.assoc,
						body: x.body,
					})),
				}),
			);
		}
		if (a === 'label' && b === 'list')
			return ok(JSON.stringify(labels.map((name) => ({ name }))));
		writes.push([...argv]);
		const issue = issues[n];
		if (a === 'issue' && b === 'comment' && issue) {
			issue.comments.push({
				login: 'github-actions',
				assoc: 'NONE',
				body: stdin ?? '',
			});
		}
		if (a === 'issue' && b === 'edit' && issue) issue.labels.push('released');
		if (a === 'issue' && b === 'close' && issue) issue.state = 'CLOSED';
		if (a === 'label' && b === 'create') labels.push(String(c));
		return ok();
	};
	return { exec, issues, writes, labels };
}

function checkout(): string {
	const dir = tempDir();
	mkdirSync(join(dir, 'packages', 'widget'), { recursive: true });
	writeFileSync(
		join(dir, 'packages', 'widget', 'package.json'),
		JSON.stringify({ name: '@nxgt/widget', version: '1.4.0' }),
	);
	return dir;
}

async function run(
	world: ReturnType<typeof fakeWorld>,
	extra: string[] = [],
	cwd = checkout(),
) {
	const lines: string[] = [];
	const code = await closeReleasedIssues(
		['--published', PUBLISHED, ...extra],
		{ GITHUB_REPOSITORY: REPO },
		world.exec,
		(line) => lines.push(line),
		cwd,
	);
	return { code, lines: lines.join('\n') };
}

const simple = (over: World = {}): World => ({
	prs: { 40: { closing: [12] } },
	issues: { 12: {} },
	...over,
});

describe('close-released-issues', () => {
	test('comments, labels and closes the issues of the PRs in the CHANGELOG section', async () => {
		const world = fakeWorld(
			simple({ prs: { 40: { closing: [12] }, 30: { closing: [9] } } }),
		);
		const { code } = await run(world);
		expect(code).toBe(0);
		expect(world.issues[12]?.comments[0]?.body).toBe(COMMENT);
		expect(world.issues[12]?.labels).toEqual(['released']);
		expect(world.issues[12]?.state).toBe('CLOSED');
		expect(world.writes).toHaveLength(3);
	});

	test('finds PRs in the git log (merge and squash), keeps those touching the package, reads the body keywords', async () => {
		const world = fakeWorld(
			simple({
				log: ['Merge pull request #41 from softistx/a', 'fix: Thing (#42)'],
				prs: {
					40: {},
					41: { body: 'Fixes #13', files: ['packages/other/a.ts'] },
					42: { body: 'Closes #14. Resolves acme/other#3' },
				},
				issues: { 13: {}, 14: {} },
			}),
		);
		await run(world);
		expect(world.issues[13]?.state).toBe('OPEN');
		expect(world.issues[14]?.state).toBe('CLOSED');
	});

	test('a PR merged into feat/* leads to the integration PR holding its commit, which the comment names', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: { base: 'feat/x', sha: 'abc', body: 'Closes #11' },
					50: { body: 'Fixes #12' },
				},
				pulls: {
					abc: [
						{ number: 40, base: 'feat/x', merged: true },
						{ number: 50, base: 'develop', merged: true },
					],
				},
				issues: { 11: {}, 12: {} },
			}),
		);
		await run(world);
		expect(world.issues[12]?.comments[0]?.body).toContain('(#50)');
		expect(world.issues[11]?.comments[0]?.body).toContain('(#50)');
	});

	test('a second run makes no new comment, label or close', async () => {
		const world = fakeWorld(simple());
		const cwd = checkout();
		await run(world, [], cwd);
		const count = world.writes.length;
		await run(world, [], cwd);
		expect(world.writes).toHaveLength(count);
	});

	test('dry run writes nothing', async () => {
		const world = fakeWorld(simple({ labels: [] }));
		const { lines } = await run(world, ['--dry-run']);
		expect(world.writes).toEqual([]);
		expect(lines).toContain('#12');
	});

	test('creates the released label when the repository lacks it', async () => {
		const world = fakeWorld(simple({ labels: ['bug'] }));
		await run(world);
		expect(world.labels).toContain('released');
		const create = world.writes.findIndex((w) => w[1] === 'label');
		const edit = world.writes.findIndex(
			(w) => w[2] === 'edit' || w[1] === 'issue',
		);
		expect(create).toBe(0);
		expect(edit).toBeGreaterThan(create);
	});

	test('an identical comment from the release bot is not posted again; a stranger copy is', async () => {
		const bot = fakeWorld(
			simple({
				issues: {
					12: {
						comments: [
							{ login: 'github-actions', assoc: 'NONE', body: COMMENT },
						],
					},
				},
			}),
		);
		await run(bot);
		expect(bot.writes.some((w) => w[2] === 'comment')).toBe(false);
		const stranger = fakeWorld(
			simple({
				issues: {
					12: { comments: [{ login: 'eve', assoc: 'NONE', body: COMMENT }] },
				},
			}),
		);
		await run(stranger);
		expect(stranger.writes.some((w) => w[2] === 'comment')).toBe(true);
	});
});

describe('it never fails the release', () => {
	const warns = async (
		args: string[],
		env: Record<string, string>,
		exec: Exec,
	) => {
		const lines: string[] = [];
		const code = await closeReleasedIssues(
			args,
			env,
			exec,
			(l) => lines.push(l),
			checkout(),
		);
		return { code, text: lines.join('\n') };
	};
	const ok: Exec = async () => ({ code: 0, stdout: '', stderr: '' });

	test('unreadable --published, no repository, no arguments', async () => {
		expect(
			(
				await warns(
					['--published', 'not json'],
					{ GITHUB_REPOSITORY: REPO },
					ok,
				)
			).code,
		).toBe(0);
		const missing = await warns(['--published', PUBLISHED], {}, ok);
		expect(missing.code).toBe(0);
		expect(missing.text).toContain('warning');
		expect((await warns([], { GITHUB_REPOSITORY: REPO }, ok)).code).toBe(0);
	});

	test('a runner that throws, or a gh that fails everywhere', async () => {
		const boom: Exec = async () => {
			throw new Error('spawn gh ENOENT');
		};
		const thrown = await warns(
			['--published', PUBLISHED],
			{ GITHUB_REPOSITORY: REPO },
			boom,
		);
		expect(thrown.code).toBe(0);
		expect(thrown.text).toContain('warning');
		const down: Exec = async () => ({
			code: 1,
			stdout: '',
			stderr: 'HTTP 500',
		});
		expect(
			(
				await warns(
					['--published', PUBLISHED],
					{ GITHUB_REPOSITORY: REPO },
					down,
				)
			).code,
		).toBe(0);
	});

	test('a package that is not in this checkout is a warning', async () => {
		const { code, text } = await warns(
			[
				'--published',
				JSON.stringify([{ name: '@nxgt/nope', version: '1.0.0' }]),
			],
			{ GITHUB_REPOSITORY: REPO },
			ok,
		);
		expect(code).toBe(0);
		expect(text).toContain('@nxgt/nope');
	});

	test('the real entry exits 0 with a gh that fails and no git on the PATH', async () => {
		const bin = tempDir();
		writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho boom >&2\nexit 1\n');
		chmodSync(join(bin, 'gh'), 0o755);
		const child = Bun.spawn(
			[
				process.execPath,
				join(import.meta.dir, 'close-released-issues.ts'),
				'--published',
				PUBLISHED,
			],
			{
				cwd: checkout(),
				env: { PATH: bin, GITHUB_REPOSITORY: REPO, NODE_ENV: 'test' },
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toContain('warning');
	});
});
