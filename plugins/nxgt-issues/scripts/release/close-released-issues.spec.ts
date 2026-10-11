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

const changelogOf = (prs: number[]) =>
	[
		'# @nxgt/widget',
		'',
		'## 1.4.0',
		'',
		...prs.map(
			(n) =>
				`- [#${n}](https://github.com/softistx/nxgt-widget/pull/${n}) Thing.`,
		),
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
	/** The packages a changeset this PR adds names. */
	changesets?: string[];
}
interface Issue {
	body: string;
	state: string;
	labels: string[];
	comments: { login: string; assoc: string; body: string }[];
}
interface World {
	log?: string[];
	/** First-parent subjects per package folder (a path-limited log). */
	logs?: Record<string, string[]>;
	/** Tags like v1.4.0 (a single-package repository). */
	plain?: boolean;
	/** The PRs the 1.4.0 CHANGELOG section lists (default #40). */
	listed?: number[];
	/** Overrides the tags `git tag` prints. */
	tagList?: string[];
	failing?: string[];
	failOnce?: string[];
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
		issues[Number(n)] = {
			body: '',
			state: 'OPEN',
			labels: [],
			comments: [],
			...i,
		};
	}
	const writes: string[][] = [];
	const calls: string[][] = [];
	const cwds: (string | undefined)[] = [];
	const failOnce = [...(init.failOnce ?? [])];
	const git = (argv: string[]) => {
		if (argv[1] === 'tag') {
			const name = String(argv[3]).replace(/@\*$/, '');
			if (init.tagList) return ok(`${init.tagList.join('\n')}\n`);
			if (init.plain) return ok('v1.4.0\nv1.3.0\n');
			return ok(`${name}@1.4.0\n${name}@1.3.0\n`);
		}
		if (argv[1] === 'log') {
			const dir = String(argv[argv.length - 1]);
			return ok(`${(init.logs?.[dir] ?? init.log ?? []).join('\n')}\n`);
		}
		const find = (sha: string) =>
			Object.values(init.prs ?? {}).find((p) => p.sha === sha);
		if (argv[1] === 'show') {
			const m = /^(\w+):\.changeset\/c(\d+)\.md$/.exec(String(argv[2]));
			if (!m) return ok(changelogOf(init.listed ?? [40]));
			const name = find(String(m[1]))?.changesets?.[Number(m[2])];
			return name ? ok(`---\n"${name}": minor\n---\n\nx\n`) : bad('fatal');
		}
		if (argv[1] === 'diff' && argv.includes('--diff-filter=A')) {
			const pr = find(String(argv[4]).replace(/\^1$/, ''));
			if (!pr) return bad('fatal: bad revision');
			return ok(
				(pr.changesets ?? []).map((_, i) => `.changeset/c${i}.md\n`).join(''),
			);
		}
		if (argv[1] === 'diff') {
			const pr = find(String(argv[3]).replace(/\^1$/, ''));
			if (!pr) return bad('fatal: bad revision');
			const dir = String(argv[argv.length - 1]);
			const files = pr.files ?? ['packages/widget/src/a.ts'];
			const inDir = (f: string) => dir === '.' || f.startsWith(`${dir}/`);
			return ok(files.filter(inDir).join('\n'));
		}
		return bad('no rule');
	};
	const exec: Exec = async (argv, stdin, cwd) => {
		calls.push(argv);
		cwds.push(cwd);
		const text = argv.join(' ');
		const once = failOnce.findIndex((needle) => text.includes(needle));
		if (once !== -1) {
			failOnce.splice(once, 1);
			return bad('HTTP 500');
		}
		if (init.failing?.some((needle) => text.includes(needle)))
			return bad('HTTP 500');
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
					body: issue.body,
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
	return { exec, issues, writes, labels, calls, cwds };
}

function rootCheckout(): string {
	const dir = tempDir();
	writeFileSync(
		join(dir, 'package.json'),
		JSON.stringify({ name: '@nxgt/widget', version: '1.4.0' }),
	);
	return dir;
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

	test('at most one comment ever: a marker for another package or version means done', async () => {
		const other =
			'Fixed in @nxgt/other@2.0.0 (#7).\n\n<!-- nxgt-issues:fixed=@nxgt/other@2.0.0 -->\n';
		const bot = { login: 'github-actions', assoc: 'NONE', body: other };
		const closed = fakeWorld(
			simple({
				issues: {
					12: { state: 'CLOSED', labels: ['released'], comments: [bot] },
				},
			}),
		);
		await run(closed);
		expect(closed.writes).toEqual([]);
		const open = fakeWorld(simple({ issues: { 12: { comments: [bot] } } }));
		const { lines } = await run(open);
		expect(open.writes.map((w) => w[2])).toEqual(['edit']);
		expect(lines).toContain('reopened');
	});

	test('a stranger copying the marker does not count', async () => {
		const body =
			'Fixed in @nxgt/other@2.0.0 (#7).\n\n<!-- nxgt-issues:fixed=@nxgt/other@2.0.0 -->\n';
		const world = fakeWorld(
			simple({
				issues: { 12: { comments: [{ login: 'eve', assoc: 'NONE', body }] } },
			}),
		);
		await run(world);
		expect(world.writes.some((w) => w[2] === 'comment')).toBe(true);
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

	const touching = (n: string) => `packages/${n}/src/x.ts`;
	const everything = ['a', 'b', 'c'].map(touching);
	const versions = (name: string) =>
		`Summary.\n\n## Versions\n\n- \`${name}\` 1.0.0\n\n## Expected\n\nx\n`;

	test('the package the issue names in its Versions section is the one the comment names', async () => {
		const world = fakeWorld(
			simple({
				prs: { 40: { closing: [12], sha: 'm40', files: everything } },
				issues: { 12: { body: versions('@nxgt/c') } },
			}),
		);
		await run(world, [], checkout('a', 'b', 'c'), published);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/c@1.4.0 (#40).',
		);
	});

	test('with no Versions match, the package that found it with the lowest rank', async () => {
		const world = fakeWorld({
			...simple({
				prs: {
					40: { closing: [12], sha: 'm40', files: [touching('b')] },
					41: {
						base: 'feat/x',
						head: 'fix/s',
						closing: [12],
						files: [touching('a')],
					},
				},
			}),
			logs: { 'packages/a': ['Merge pull request #41 from softistx/fix'] },
		});
		await run(world, [], checkout('a', 'b', 'c'), published);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/b@1.4.0 (#40).',
		);
	});

	const only = JSON.stringify([{ name: '@nxgt/a', version: '1.4.0' }]);

	test('an issue naming an unpublished sibling that the fixing PR also touched is left to its release', async () => {
		const world = fakeWorld(
			simple({
				prs: {
					40: {
						closing: [12],
						sha: 'm40',
						files: everything,
						changesets: ['@nxgt/c'],
					},
				},
				issues: { 12: { body: versions('@nxgt/c') } },
			}),
		);
		const { lines } = await run(world, [], checkout('a', 'b', 'c'), only);
		expect(world.writes.filter((w) => w[1] === 'issue')).toEqual([]);
		expect(lines).toContain('@nxgt/c');
	});

	test('a touched sibling with no changeset naming it is handled, never skipped', async () => {
		const world = fakeWorld(
			simple({
				prs: { 40: { closing: [12], sha: 'm40', files: everything } },
				issues: { 12: { body: versions('@nxgt/c') } },
			}),
		);
		await run(world, [], checkout('a', 'b', 'c'), only);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/a@1.4.0 (#40).',
		);
	});

	test('a slice issue is handled even when the integration PR touched the sibling through another slice', async () => {
		const world = fakeWorld({
			...simple({
				prs: {
					41: {
						base: 'feat/x',
						head: 'fix/s41',
						closing: [12],
						sha: 'm41',
						files: [touching('a')],
					},
					42: {
						base: 'feat/x',
						head: 'fix/s42',
						sha: 'm42',
						files: [touching('c')],
						changesets: ['@nxgt/c'],
					},
					40: {
						head: 'feat/x',
						sha: 'm40',
						files: [touching('a'), touching('c')],
						changesets: ['@nxgt/c'],
					},
				},
				issues: { 12: { body: versions('@nxgt/c') } },
			}),
			listed: [41, 42],
		});
		await run(world, ['--dry-run'], checkout('a', 'b', 'c'), only);
		expect(world.writes).toEqual([]);
		const real = await run(world, [], checkout('a', 'b', 'c'), only);
		expect(real.lines).not.toContain('left to');
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/a@1.4.0',
		);
	});

	test('rank 0 + touched + changeset: skipped now, and the sibling run comments later', async () => {
		const prs = {
			40: {
				closing: [12],
				sha: 'm40',
				files: [touching('a'), touching('c')],
				changesets: ['@nxgt/c'],
			},
		};
		const world = fakeWorld(
			simple({ prs, issues: { 12: { body: versions('@nxgt/c') } } }),
		);
		await run(world, [], checkout('a', 'b', 'c'), only);
		expect(world.writes.filter((w) => w[1] === 'issue')).toEqual([]);
		const later = JSON.stringify([{ name: '@nxgt/c', version: '1.4.0' }]);
		await run(world, [], checkout('a', 'b', 'c'), later);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/c@1.4.0 (#40).',
		);
	});

	test('one the fixing PR did not touch is handled under the published package', async () => {
		const world = fakeWorld(
			simple({
				prs: { 40: { closing: [12], sha: 'm40', files: [touching('a')] } },
				issues: { 12: { body: versions('@nxgt/c') } },
			}),
		);
		await run(world, [], checkout('a', 'b', 'c'), only);
		expect(world.issues[12]?.comments[0]?.body).toStartWith(
			'Fixed in @nxgt/a@1.4.0 (#40).',
		);
		expect(world.issues[12]?.state).toBe('CLOSED');
	});

	test('a Versions section in a fenced block is not read, and a private root is no sibling', async () => {
		const fenced = fakeWorld(
			simple({
				prs: { 40: { closing: [12], sha: 'm40', files: everything } },
				issues: { 12: { body: `x\n\n\`\`\`\n${versions('@nxgt/c')}\`\`\`\n` } },
			}),
		);
		await run(fenced, [], checkout('a', 'b', 'c'), only);
		expect(fenced.issues[12]?.state).toBe('CLOSED');
		const root = fakeWorld(
			simple({
				prs: { 40: { closing: [12], sha: 'm40', files: everything } },
				issues: { 12: { body: versions('acme-root') } },
			}),
		);
		const dir = checkout('a', 'b', 'c');
		writeFileSync(
			join(dir, 'package.json'),
			JSON.stringify({
				name: 'acme-root',
				private: true,
				workspaces: ['packages/*'],
			}),
		);
		await run(root, [], dir, only);
		expect(root.issues[12]?.state).toBe('CLOSED');
	});

	test('a package name is matched literally against the tags', async () => {
		const world = fakeWorld({
			...simple({ prs: { 40: { closing: [12] } } }),
			tagList: ['@nxgt/a.c@1.4.0', '@nxgt/abc@1.3.5', '@nxgt/a.c@1.3.0'],
		});
		const one = JSON.stringify([{ name: '@nxgt/a.c', version: '1.4.0' }]);
		await run(world, [], checkout('a.c'), one);
		const log = world.calls.find((c) => c[1] === 'log');
		expect(log?.join(' ')).toContain('@nxgt/a.c@1.3.0..HEAD');
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

describe('order, lookups and the working directory', () => {
	test('the comment (the marker) is written last: a close that fails once is redone, never reported as reopened', async () => {
		const world = fakeWorld({ ...simple(), failOnce: ['issue close'] });
		const cwd = checkout();
		const first = await run(world, [], cwd);
		expect(first.lines).toContain('warning');
		expect(world.issues[12]?.comments).toEqual([]);
		expect(world.issues[12]?.labels).toEqual(['released']);
		const second = await run(world, [], cwd);
		expect(second.lines).not.toContain('reopened');
		expect(world.issues[12]?.state).toBe('CLOSED');
		expect(world.writes.map((w) => w[2]).slice(-2)).toEqual([
			'close',
			'comment',
		]);
	});

	test('a failed integration lookup keeps the slice issues, named after the slice', async () => {
		const world = fakeWorld({
			...simple({
				prs: { 40: { base: 'feat/x', head: 'fix/s', closing: [12] } },
			}),
			failing: ['pr list'],
		});
		const { lines } = await run(world);
		expect(lines).toContain('warning');
		expect(world.issues[12]?.comments[0]?.body).toContain('(#40)');
	});

	test('the PR numbers read are printed per package, in a dry run too', async () => {
		const world = fakeWorld(
			simple({
				log: ['fix: Thing (#42)'],
				prs: { 40: { closing: [12] }, 42: {} },
			}),
		);
		const { lines } = await run(world, ['--dry-run']);
		expect(lines).toContain('#40, #42');
	});

	test('every command runs in the given working directory', async () => {
		const world = fakeWorld(simple());
		const cwd = checkout();
		await run(world, [], cwd);
		expect(world.cwds.length).toBeGreaterThan(0);
		expect(world.cwds.every((c) => c === cwd)).toBe(true);
	});

	test('a single package at the repository root: v tags, the whole tree, the root CHANGELOG', async () => {
		const world = fakeWorld({
			...simple({
				prs: { 40: { closing: [12], sha: 'm40', files: ['src/a.ts'] } },
			}),
			plain: true,
		});
		await run(world, [], rootCheckout());
		expect(world.issues[12]?.state).toBe('CLOSED');
		expect(world.calls.find((c) => c[1] === 'log')).toContain('v1.3.0..HEAD');
		expect(world.calls.find((c) => c[1] === 'show')?.[2]).toBe(
			'HEAD:CHANGELOG.md',
		);
		expect(world.calls.find((c) => c[1] === 'diff')?.slice(-2)).toEqual([
			'--',
			'.',
		]);
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
