/**
 * A stateful fake GitHub for the release specs: a library repository
 * `softistx/nxgt-widget` with the package `@nxgt/widget` under
 * `packages/widget`, its tags and git log, its PRs and issues. A comment, a
 * label or a close made through the runner changes the world, so a second run
 * sees what the first did.
 */

import type { GhContext } from './github';
import type { Runner, RunResult } from './runner';
import { tempDir } from './temp.fixtures';

export const REPO = { owner: 'softistx', repo: 'nxgt-widget' } as const;
export const PKG = '@nxgt/widget';
export const DIR = 'packages/widget';

export interface WorldPr {
	base?: string;
	body?: string;
	closing?: number[];
	files?: string[];
	mergeSha?: string;
}

export interface WorldIssue {
	state?: 'OPEN' | 'CLOSED';
	labels?: string[];
	comments?: { login: string; assoc: string; body: string }[];
}

export interface World {
	tags?: string[];
	log?: string[];
	changelog?: string;
	prs?: Record<number, WorldPr>;
	/** Pull requests `commits/<sha>/pulls` answers with. */
	commitPulls?: Record<
		string,
		{ number: number; base: string; merged: boolean }[]
	>;
	issues?: Record<number, WorldIssue>;
	repoLabels?: string[];
	tracking?: { repo: string; number: number; title: string; body: string }[];
	failing?: readonly string[];
}

export const CHANGELOG = [
	'# @nxgt/widget',
	'',
	'## 1.4.0',
	'',
	'### Minor Changes',
	'',
	'- [#40](https://github.com/softistx/nxgt-widget/pull/40) [`abc`](x) Thanks! - Adds a thing.',
	'',
	'## 1.3.0',
	'',
	'- [#30](https://github.com/softistx/nxgt-widget/pull/30) Older.',
].join('\n');

const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
const fail = (stderr: string): RunResult => ({ code: 1, stdout: '', stderr });

export interface Fake {
	readonly runner: Runner;
	readonly calls: string[][];
	readonly world: Required<World>;
	/** The calls that change something on GitHub. */
	writes(): string[][];
}

const WRITES = [
	['gh', 'issue', 'comment'],
	['gh', 'issue', 'edit'],
	['gh', 'issue', 'close'],
	['gh', 'label', 'create'],
];

export function fakeWorld(init: World = {}): Fake {
	const world: Required<World> = {
		tags: ['@nxgt/widget@1.4.0', '@nxgt/widget@1.3.0'],
		log: [],
		changelog: CHANGELOG,
		prs: {},
		commitPulls: {},
		issues: {},
		repoLabels: ['bug', 'released'],
		tracking: [],
		failing: [],
		...init,
	};
	const calls: string[][] = [];
	const stateOf = (n: number) => world.issues[n];
	const mutable = (n: number): Required<WorldIssue> => {
		const issue = world.issues[n] ?? {};
		world.issues[n] = issue;
		return Object.assign(issue, {
			state: issue.state ?? 'OPEN',
			labels: issue.labels ?? [],
			comments: issue.comments ?? [],
		}) as Required<WorldIssue>;
	};

	function gh(argv: readonly string[], stdin?: string): RunResult {
		const [, area, verb, third] = argv;
		const n = Number(third);
		if (area === 'pr' && verb === 'view') {
			const pr = world.prs[n];
			if (!pr) return fail('no pull request found');
			return ok(
				JSON.stringify({
					number: n,
					baseRefName: pr.base ?? 'develop',
					body: pr.body ?? '',
					closingIssuesReferences: (pr.closing ?? []).map((number) => ({
						number,
						repository: { name: 'nxgt-widget', owner: { login: 'softistx' } },
					})),
					mergeCommit: pr.mergeSha ? { oid: pr.mergeSha } : null,
					files: (pr.files ?? [`${DIR}/src/a.ts`]).map((path) => ({ path })),
				}),
			);
		}
		if (area === 'api') {
			const sha = /commits\/(\w+)\/pulls$/.exec(String(verb))?.[1] ?? '';
			return ok(
				JSON.stringify(
					(world.commitPulls[sha] ?? []).map((p) => ({
						number: p.number,
						base: { ref: p.base },
						merged_at: p.merged ? '2026-10-01T00:00:00Z' : null,
					})),
				),
			);
		}
		if (area === 'issue' && verb === 'view') {
			const issue = stateOf(Number(third));
			if (!issue) return fail('Could not resolve to an Issue');
			return ok(
				JSON.stringify({
					number: n,
					state: issue.state ?? 'OPEN',
					labels: (issue.labels ?? []).map((name) => ({ name })),
					comments: (issue.comments ?? []).map((c) => ({
						author: { login: c.login },
						authorAssociation: c.assoc,
						body: c.body,
					})),
				}),
			);
		}
		if (area === 'issue' && verb === 'comment') {
			mutable(n).comments.push({
				login: 'steve',
				assoc: 'OWNER',
				body: stdin ?? '',
			});
			return ok('https://github.com/softistx/nxgt-widget/issues/1#c\n');
		}
		if (area === 'issue' && verb === 'edit') {
			mutable(n).labels.push(String(argv[argv.indexOf('--add-label') + 1]));
			return ok();
		}
		if (area === 'issue' && verb === 'close') {
			mutable(n).state = 'CLOSED';
			return ok();
		}
		if (area === 'label' && verb === 'list') {
			return ok(JSON.stringify(world.repoLabels.map((name) => ({ name }))));
		}
		if (area === 'label' && verb === 'create') {
			world.repoLabels.push(String(third));
			return ok();
		}
		if (area === 'search') {
			return ok(
				JSON.stringify(
					world.tracking.map((t) => ({
						number: t.number,
						title: t.title,
						body: t.body,
						labels: [{ name: 'upstream' }],
						repository: { nameWithOwner: t.repo },
					})),
				),
			);
		}
		return fail(`fake world: no rule for gh ${argv.join(' ')}`);
	}

	function git(argv: readonly string[]): RunResult {
		if (argv[1] === 'tag') return ok(`${world.tags.join('\n')}\n`);
		if (argv[1] === 'log') return ok(`${world.log.join('\n')}\n`);
		if (argv[1] === 'show') return ok(world.changelog);
		return fail(`fake world: no rule for git ${argv.join(' ')}`);
	}

	const runner: Runner = {
		async run(argv, options = {}) {
			calls.push([...argv]);
			const text = argv.join(' ');
			if (world.failing.some((needle) => text.includes(needle))) {
				return fail('HTTP 500: server error');
			}
			return argv[0] === 'git' ? git(argv) : gh(argv, options.stdin);
		},
		async fetchJson() {
			throw new Error('fake world: no network');
		},
	};
	return {
		runner,
		calls,
		world,
		writes: () =>
			calls.filter((call) =>
				WRITES.some((write) => write.every((w, i) => call[i] === w)),
			),
	};
}

export function ghContext(fake: Fake): GhContext {
	return {
		runner: fake.runner,
		home: tempDir('home'),
		now: () => Date.parse('2026-10-10T12:00:00Z'),
	};
}
