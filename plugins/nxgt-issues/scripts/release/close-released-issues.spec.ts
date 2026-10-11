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
import { closeReleasedIssues } from './close-released-issues';
import type { Exec } from './close-released-issues-lib';

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
	head?: string;
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
	issues?: Record<number, Partial<Issue>>;
	labels?: string[];
}

const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const bad = (stderr: string) => ({ code: 1, stdout: '', stderr });

/** GitHub's shape for a PR, as `gh pr view` and `gh pr list` print it. */
const prJson = (n: number, pr: Pr) => ({
	number: n,
	baseRefName: pr.base ?? 'develop',
	headRefName: pr.head ?? `fix/${n}`,
	body: pr.body ?? '',
	closingIssuesReferences: (pr.closing ?? []).map((number) => ({
		number,
		repository: { name: 'nxgt-widget', owner: { login: 'softistx' } },
	})),
	mergeCommit: pr.sha ? { oid: pr.sha } : null,
	files: (pr.files ?? ['packages/widget/src/a.ts']).map((path) => ({ path })),
});

function fakeWorld(init: World) {
	const labels = init.labels ?? ['released'];
	const issues: Record<number, Issue> = {};
	for (const [n, i] of Object.entries(init.issues ?? {})) {
		issues[Number(n)] = { state: 'OPEN', labels: [], comments: [], ...i };
	}
	const writes: string[][] = [];
	const calls: string[][] = [];
	const git = (argv: string[]) => {
		if (argv[1] === 'tag') {
			const name = String(argv[3]).replace(/@\*$/, '');
			return ok(`${name}@1.4.0\n${name}@1.3.0\n`);
		}
		if (argv[1] === 'log') return ok(`${(init.log ?? []).join('\n')}\n`);
		if (argv[1] === 'show') return ok(CHANGELOG);
		if (argv[1] === 'diff') {
			const sha = String(argv[3]).replace(/\^1$/, '');
			const pr = Object.values(init.prs ?? {}).find((p) => p.sha === sha);
			if (!pr) return bad('fatal: bad revision');
			const dir = String(argv[argv.length - 1]);
			const files = pr.files ?? ['packages/widget/src/a.ts'];
			return ok(files.filter((f) => f.startsWith(`${dir}/`)).join('\n'));
		}
		return bad('no rule');
	};
	const exec: Exec = async (argv, stdin) => {
		calls.push(argv);
		const [tool, a, b, c] = argv;
		const n = Number(c ?? b);
		if (tool === 'git') return git(argv);
		if (a === 'pr' && b === 'view') {
			const pr = init.prs?.[Number(c)];
			return pr
				? ok(JSON.stringify(prJson(n, pr)))
				: bad('no pull request found');
		}
		if (a === 'pr' && b === 'list') {
			const head = argv[argv.indexOf('--head') + 1];
			const rows = Object.entries(init.prs ?? {}).filter(
				([, p]) => p.head === head,
			);
			return ok(JSON.stringify(rows.map(([k, p]) => prJson(Number(k), p))));
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
			const body = stdin ?? '';
			issue.comments.push({ login: 'github-actions', assoc: 'NONE', body });
		}
		if (a === 'issue' && b === 'edit' && issue) issue.labels.push('released');
		if (a === 'issue' && b === 'close' && issue) issue.state = 'CLOSED';
		if (a === 'label' && b === 'create') labels.push(String(c));
		return ok();
	};
	return { exec, issues, writes, labels, calls };
}

function checkout(...names: string[]): string {
	const dir = tempDir();
	for (const name of names.length > 0 ? names : ['widget']) {
		mkdirSync(join(dir, 'packages', name), { recursive: true });
		writeFileSync(
			join(dir, 'packages', name, 'package.json'),
			JSON.stringify({
				name: name === 'widget' ? '@nxgt/widget' : `@nxgt/${name}`,
				version: '1.4.0',
			}),
		);
	}
	return dir;
}

async function run(
	world: ReturnType<typeof fakeWorld>,
	extra: string[] = [],
	cwd = checkout(),
	published = PUBLISHED,
) {
	const lines: string[] = [];
	const code = await closeReleasedIssues(
		['--published', published, ...extra],
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

	test('finds PRs in the first-parent log (merge and squash), without a files filter, and reads the body keywords', async () => {
		const world = fakeWorld(
			simple({
				log: ['Merge pull request #41 from softistx/a', 'fix: Thing (#42)'],
				prs: {
					40: {},
					41: { body: 'Fixes #13' },
					42: { body: 'Closes #14. Resolves acme/other#3' },
				},
				issues: { 13: {}, 14: {} },
			}),
		);
		await run(world);
		expect(world.issues[13]?.state).toBe('CLOSED');
		expect(world.issues[14]?.state).toBe('CLOSED');
	});

	test('a PR merged into feat/* leads to the PR merged from that branch (found by head branch), which the comment names', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: {
						base: 'feat/x',
						head: 'fix/slice',
						sha: 'abc',
						body: 'Closes #11',
					},
					50: { head: 'feat/x', body: 'Fixes #12' },
				},
				issues: { 11: {}, 12: {} },
			}),
		);
		await run(world);
		expect(world.issues[12]?.comments[0]?.body).toContain('(#50)');
		expect(world.issues[11]?.comments[0]?.body).toContain('(#50)');
		const list = world.calls.find((c) => c[2] === 'pr' || c[1] === 'pr');
		expect(
			world.calls.some((c) => c.includes('--head') && c.includes('feat/x')),
		).toBe(true);
		expect(list).toBeDefined();
		expect(world.calls.some((c) => c[1] === 'api')).toBe(false);
	});

	test('the log is first-parent and its PRs need no files filter; the Version PR is skipped', async () => {
		const world = fakeWorld(
			simple({
				log: [
					'Merge pull request #41 from softistx/a',
					'Merge pull request #45 from softistx/changeset-release/develop',
				],
				prs: {
					40: {},
					41: { body: 'Fixes #13', files: ['packages/other/a.ts'] },
					45: { head: 'changeset-release/develop', body: 'fixes #99' },
				},
				issues: { 13: {}, 99: {} },
			}),
		);
		await run(world);
		expect(world.calls.find((c) => c[1] === 'log')).toContain('--first-parent');
		expect(world.issues[13]?.state).toBe('CLOSED');
		expect(world.issues[99]?.state).toBe('OPEN');
	});

	test('a PR listed in the CHANGELOG that did not touch the package is dropped', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: { closing: [12], sha: 'm40', files: ['packages/other/a.ts'] },
				},
			}),
		);
		await run(world);
		expect(world.issues[12]?.state).toBe('OPEN');
	});

	test('keywords in code spans, fenced blocks and quotes close nothing; a URL form closes', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: {
						body: 'Used `Fixes #14`.\n> Fixes #15\n```\nCloses #16\n```\nFixes https://github.com/softistx/nxgt-widget/issues/12',
					},
				},
				issues: { 12: {}, 14: {}, 15: {}, 16: {} },
			}),
		);
		await run(world);
		expect(world.issues[12]?.state).toBe('CLOSED');
		for (const n of [14, 15, 16]) expect(world.issues[n]?.state).toBe('OPEN');
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

	test('the hidden marker is the key: another PR number gives no second comment', async () => {
		const body =
			'Fixed in @nxgt/widget@1.4.0 (#99).\n\n<!-- nxgt-issues:fixed=@nxgt/widget@1.4.0 -->\n';
		const world = fakeWorld(
			simple({
				issues: {
					12: {
						state: 'CLOSED',
						comments: [{ login: 'github-actions', assoc: 'NONE', body }],
					},
				},
			}),
		);
		await run(world);
		expect(world.writes.some((w) => w[2] === 'comment')).toBe(false);
	});

	test('a reopened issue is not closed again, a note says so, the label is added', async () => {
		const world = fakeWorld(
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
		const { lines } = await run(world);
		expect(world.issues[12]?.state).toBe('OPEN');
		expect(world.issues[12]?.labels).toEqual(['released']);
		expect(world.writes.some((w) => w[2] === 'close')).toBe(false);
		expect(lines).toContain('reopened');
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

describe('several packages published together', () => {
	const published = JSON.stringify(
		['a', 'b', 'c'].map((n) => ({ name: `@nxgt/${n}`, version: '1.4.0' })),
	);

	test('an issue gets one comment, naming the first package', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: {
						closing: [12],
						sha: 'm40',
						files: ['a', 'b', 'c'].map((n) => `packages/${n}/src/x.ts`),
					},
				},
			}),
		);
		await run(world, [], checkout('a', 'b', 'c'), published);
		const comments = world.writes.filter((w) => w[2] === 'comment');
		expect(comments).toHaveLength(1);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/a@1.4.0 (#40).',
		);
		expect(world.writes.filter((w) => w[2] === 'close')).toHaveLength(1);
		const again = world.writes.length;
		await run(world, [], checkout('a', 'b', 'c'), published);
		expect(world.writes).toHaveLength(again);
	});

	test('a PR that touched one package is not credited to the others', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: { closing: [12], sha: 'm40', files: ['packages/b/src/x.ts'] },
				},
			}),
		);
		await run(world, [], checkout('a', 'b', 'c'), published);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/b@1.4.0',
		);
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
