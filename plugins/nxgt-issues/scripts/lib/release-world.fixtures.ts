/**
 * The data and the handlers of the stateful fake GitHub of the release specs: a library repository
 * `softistx/nxgt-widget` with the package `@nxgt/widget` under
 * `packages/widget`, its tags and git log, its PRs and issues. A comment, a
 * label or a close made through the runner changes the world, so a second run
 * sees what the first did.
 */

import type { RunResult } from './runner';

export const REPO = { owner: 'softistx', repo: 'nxgt-widget' } as const;
export const PKG = '@nxgt/widget';
export const DIR = 'packages/widget';

export interface WorldPr {
	base?: string;
	/** The branch the PR comes from; a PR listed by `--head` has it. */
	head?: string;
	body?: string;
	closing?: number[];
	files?: string[];
	mergeSha?: string;
	/** The packages a changeset this PR adds names. */
	changesets?: string[];
}

export interface WorldIssue {
	body?: string;
	state?: 'OPEN' | 'CLOSED';
	labels?: string[];
	comments?: { login: string; assoc: string; body: string }[];
}

export interface World {
	tags?: string[];
	/** First-parent subjects, as `git log --first-parent --format=%s` prints them. */
	log?: string[];
	changelog?: string;
	prs?: Record<number, WorldPr>;
	issues?: Record<number, WorldIssue>;
	repoLabels?: string[];
	tracking?: { repo: string; number: number; title: string; body: string }[];
	failing?: readonly string[];
	/** Calls that fail the first time only (a needle each). */
	failOnce?: string[];
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

export const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
export const fail = (stderr: string): RunResult => ({
	code: 1,
	stdout: '',
	stderr,
});

export type W = Required<World>;
type Handler = (w: W, argv: readonly string[], stdin?: string) => RunResult;

/** What `gh pr view` and `gh pr list` print for a PR (GitHub's shape). */
const prJson = (n: number, pr: WorldPr) => ({
	number: n,
	baseRefName: pr.base ?? 'develop',
	headRefName: pr.head ?? `fix/${n}`,
	body: pr.body ?? '',
	closingIssuesReferences: (pr.closing ?? []).map((number) => ({
		number,
		repository: { name: 'nxgt-widget', owner: { login: 'softistx' } },
	})),
	mergeCommit: pr.mergeSha ? { oid: pr.mergeSha } : null,
	files: (pr.files ?? [`${DIR}/src/a.ts`]).map((path) => ({ path })),
});

const prView: Handler = (w, argv) => {
	const n = Number(argv[3]);
	const pr = w.prs[n];
	return pr ? ok(JSON.stringify(prJson(n, pr))) : fail('no pull request found');
};

/** `gh pr list --state merged --head <branch>`: the PRs coming from that branch. */
const prList: Handler = (w, argv) => {
	const head = String(argv[argv.indexOf('--head') + 1]);
	const rows = Object.entries(w.prs)
		.filter(([, pr]) => pr.head === head)
		.map(([n, pr]) => prJson(Number(n), pr));
	return ok(JSON.stringify(rows));
};

/** `commits/<sha>/pulls` lists only the PR that brought the commit in, never the one that merged it on. */
const commitPulls: Handler = (w, argv) => {
	const sha = /commits\/(\w+)\/pulls$/.exec(String(argv[2]))?.[1];
	const rows = Object.entries(w.prs)
		.filter(([, pr]) => pr.mergeSha === sha)
		.map(([n, pr]) => ({
			number: Number(n),
			base: { ref: pr.base ?? 'develop' },
			merged_at: '2026-10-01T00:00:00Z',
		}));
	return ok(JSON.stringify(rows));
};

const issueAt = (w: W, n: number): Required<WorldIssue> => {
	const issue = w.issues[n] ?? {};
	w.issues[n] = issue;
	return Object.assign(issue, {
		state: issue.state ?? 'OPEN',
		labels: issue.labels ?? [],
		comments: issue.comments ?? [],
	}) as Required<WorldIssue>;
};

const issueView: Handler = (w, argv) => {
	const n = Number(argv[3]);
	if (!w.issues[n]) return fail('Could not resolve to an Issue');
	const issue = issueAt(w, n);
	return ok(
		JSON.stringify({
			number: n,
			body: issue.body ?? '',
			state: issue.state,
			labels: issue.labels.map((name) => ({ name })),
			comments: issue.comments.map((c) => ({
				author: { login: c.login },
				authorAssociation: c.assoc,
				body: c.body,
			})),
		}),
	);
};

const issueWrite: Handler = (w, argv, stdin) => {
	const issue = issueAt(w, Number(argv[3]));
	if (argv[2] === 'comment') {
		issue.comments.push({ login: 'steve', assoc: 'OWNER', body: stdin ?? '' });
	} else if (argv[2] === 'edit') {
		issue.labels.push(String(argv[argv.indexOf('--add-label') + 1]));
	} else issue.state = 'CLOSED';
	return ok('https://github.com/softistx/nxgt-widget/issues/1#c\n');
};

const labels: Handler = (w, argv) => {
	if (argv[2] === 'create') {
		w.repoLabels.push(String(argv[3]));
		return ok();
	}
	return ok(JSON.stringify(w.repoLabels.map((name) => ({ name }))));
};

const search: Handler = (w) =>
	ok(
		JSON.stringify(
			w.tracking.map((t) => ({
				number: t.number,
				title: t.title,
				body: t.body,
				labels: [{ name: 'upstream' }],
				repository: { nameWithOwner: t.repo },
			})),
		),
	);

const GH: Record<string, Handler> = {
	'pr view': prView,
	'pr list': prList,
	'issue view': issueView,
	'issue comment': issueWrite,
	'issue edit': issueWrite,
	'issue close': issueWrite,
	'label list': labels,
	'label create': labels,
};

export function gh(w: W, argv: readonly string[], stdin?: string): RunResult {
	if (argv[1] === 'api') return commitPulls(w, argv, stdin);
	if (argv[1] === 'search') return search(w, argv, stdin);
	const handler = GH[`${argv[1]} ${argv[2]}`];
	return handler
		? handler(w, argv, stdin)
		: fail(`fake world: no rule for gh ${argv.join(' ')}`);
}

const noRevision = () => fail('fatal: bad revision');

/** `git diff --name-only --diff-filter=A <sha>^1 <sha> -- .changeset/`: the changeset files a merge added. */
function addedChangesets(w: W, argv: readonly string[]): RunResult {
	const sha = String(argv[4]).replace(/\^1$/, '');
	const pr = Object.values(w.prs).find((p) => p.mergeSha === sha);
	if (!pr) return noRevision();
	return ok(
		(pr.changesets ?? []).map((_, i) => `.changeset/c${i}.md\n`).join(''),
	);
}

/** `git show <sha>:.changeset/c<i>.md`: a changeset's frontmatter. */
function changesetFile(w: W, spec: string): RunResult {
	const m = /^(\w+):\.changeset\/c(\d+)\.md$/.exec(spec);
	const pr = Object.values(w.prs).find((p) => p.mergeSha === m?.[1]);
	const name = pr?.changesets?.[Number(m?.[2])];
	if (!name) return noRevision();
	return ok(`---\n"${name}": minor\n---\n\nSomething.\n`);
}

/** `git diff --name-only <sha>^1 <sha> -- <dir>`: what the merge brought into the package. */
function diff(w: W, argv: readonly string[]): RunResult {
	if (argv.includes('--diff-filter=A')) return addedChangesets(w, argv);
	const sha = String(argv[3]).replace(/\^1$/, '');
	const pr = Object.values(w.prs).find((p) => p.mergeSha === sha);
	if (!pr) return noRevision();
	const dir = String(argv[argv.length - 1]);
	const files = (pr.files ?? [`${DIR}/src/a.ts`]).filter(
		(f) => dir === '.' || f.startsWith(`${dir}/`),
	);
	return ok(files.join('\n'));
}

export function git(w: W, argv: readonly string[]): RunResult {
	if (argv[1] === 'tag') return ok(`${w.tags.join('\n')}\n`);
	if (argv[1] === 'log') return ok(`${w.log.join('\n')}\n`);
	if (argv[1] === 'show') {
		return /^\w+:\.changeset\//.test(String(argv[2]))
			? changesetFile(w, String(argv[2]))
			: ok(w.changelog);
	}
	if (argv[1] === 'diff') return diff(w, argv);
	return fail(`fake world: no rule for git ${argv.join(' ')}`);
}
