/**
 * Which issues a published `<package>@<version>` fixes. The pull requests are
 * the `[#N]` links of the version's CHANGELOG section that touched the package,
 * plus the PRs the first-parent log of `packages/<dir>` names since the
 * package's previous tag (merged PRs, the integration PR included). Each PR
 * gives its closing issues: GitHub's `closingIssuesReferences`, then the
 * closing keywords of its body outside code and quotes. A PR merged into a
 * `feat/*` branch closes nothing by itself, so the merged PR from that branch
 * into the default branch (found by its head branch) is read too and named in
 * the "Fixed in" comment. Only issues of the library's own repository count.
 */

import { type GhContext, ghJson, RateLimitedError } from './github';
import {
	changelogPath,
	changelogPrs,
	commitTouches,
	git,
	inDir,
	loggedPrs,
	type ReleaseInput,
} from './release-git';

export type { ReleaseInput };

import { closingRefs } from './refs';
import { formatRepo, type RepoId, sameRepo } from './repo-id';

/** An issue the release fixes and the PR the comment names. */
export interface Fix {
	readonly issue: number;
	readonly pr: number;
	/** The merge commit of that PR, when GitHub gave one. */
	readonly sha?: string | undefined;
}

export interface Discovery {
	/** The PRs found directly (CHANGELOG and git log), in order. */
	readonly prs: number[];
	readonly fixes: Fix[];
	readonly warnings: string[];
	readonly notes: string[];
}

interface PrInfo {
	readonly number: number;
	readonly base: string;
	readonly head: string;
	readonly mergeSha: string | undefined;
	readonly issues: number[];
	readonly files: string[];
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const FIELDS =
	'number,baseRefName,headRefName,body,closingIssuesReferences,mergeCommit,files';

/** A PR as `gh pr view` and `gh pr list` print it: its closing issues of this repository, GitHub's list first, then the body keywords. */
function toInfo(value: unknown, repo: RepoId): PrInfo {
	const raw = obj(value);
	const issues = new Set<number>();
	for (const item of list(raw['closingIssuesReferences'])) {
		const ref = obj(item);
		const where = obj(ref['repository']);
		const owner = obj(where['owner'])['login'];
		const here =
			typeof where['name'] !== 'string' ||
			typeof owner !== 'string' ||
			sameRepo({ owner, repo: where['name'] }, repo);
		if (here && Number.isInteger(ref['number']))
			issues.add(Number(ref['number']));
	}
	for (const ref of closingRefs(String(raw['body'] ?? ''))) {
		if (!ref.repo || sameRepo(ref.repo, repo)) issues.add(ref.number);
	}
	const sha = obj(raw['mergeCommit'])['oid'];
	return {
		number: Number(raw['number']),
		base: String(raw['baseRefName'] ?? ''),
		head: String(raw['headRefName'] ?? ''),
		mergeSha: typeof sha === 'string' ? sha : undefined,
		issues: [...issues],
		files: list(raw['files']).map((file) => String(obj(file)['path'] ?? '')),
	};
}

async function readInfo(
	ctx: GhContext,
	repo: RepoId,
	number: number,
): Promise<PrInfo> {
	const raw = await ghJson(ctx, [
		...['pr', 'view', String(number), '-R', formatRepo(repo)],
		...['--json', FIELDS],
	]);
	return toInfo(raw, repo);
}

/**
 * The merged PRs that came from `branch` into a branch that is not `feat/*`.
 * `commits/<sha>/pulls` cannot give them: it lists only the PR that brought
 * the commit in (the slice), never the one that merged the branch on.
 */
async function integrationPrs(
	ctx: GhContext,
	repo: RepoId,
	branch: string,
): Promise<PrInfo[]> {
	const rows = await ghJson<unknown[]>(ctx, [
		...['pr', 'list', '-R', formatRepo(repo), '--state', 'merged'],
		...['--head', branch, '--json', FIELDS],
	]);
	return list(rows)
		.map((row) => toInfo(row, repo))
		.filter((pr) => !pr.base.startsWith('feat/'));
}

/** A CHANGELOG-listed PR counts when its merge commit changed the package (its files when git cannot say). */
async function touchesPackage(
	ctx: GhContext,
	info: PrInfo,
	dir: string,
): Promise<boolean> {
	const byGit = info.mergeSha
		? await commitTouches(ctx, info.mergeSha, dir)
		: undefined;
	return byGit ?? info.files.some((file) => inDir(dir, file));
}

const message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export async function discoverFixes(
	ctx: GhContext,
	input: ReleaseInput,
): Promise<Discovery> {
	const warnings: string[] = [];
	const notes: string[] = [];
	const tag = `${input.pkg}@${input.version}`;
	const changelog =
		(await git(ctx, ['show', `${tag}:${changelogPath(input.dir)}`])) ??
		(await git(ctx, ['show', `HEAD:${changelogPath(input.dir)}`])) ??
		'';
	const listed = changelogPrs(changelog, input.version);
	const logged = await loggedPrs(ctx, input, notes);
	const prs = [...new Set([...listed, ...logged])];

	// rank: 0 an integration PR's own issues, 1 a slice's, named after its integration PR, 2 a slice with none yet
	const found = new Map<number, Fix & { rank: number }>();
	const keep = (issue: number, pr: PrInfo, rank: number, sha = pr.mergeSha) => {
		const known = found.get(issue);
		if (!known || rank < known.rank) {
			found.set(issue, { issue, pr: pr.number, sha, rank });
		}
	};
	const branches = new Map<string, PrInfo[]>();
	const touched: number[] = [];
	for (const number of prs) {
		try {
			const info = await readInfo(ctx, input.repo, number);
			if (info.head.startsWith('changeset-release/')) continue;
			// The path-limited log proves a logged PR touched the package; a listed one may belong to another package.
			if (
				!logged.includes(number) &&
				!(await touchesPackage(ctx, info, input.dir))
			)
				continue;
			touched.push(number);
			if (!info.base.startsWith('feat/')) {
				for (const issue of info.issues) keep(issue, info, 0);
				continue;
			}
			if (!branches.has(info.base)) {
				try {
					const parents = await integrationPrs(ctx, input.repo, info.base);
					branches.set(info.base, parents);
				} catch (error) {
					if (error instanceof RateLimitedError) throw error;
					// No parents: the issues fall back to naming the slice PR.
					branches.set(info.base, []);
					warnings.push(`integration PR of ${info.base}: ${message(error)}`);
				}
			}
			const parents = branches.get(info.base) ?? [];
			for (const issue of info.issues) {
				if (parents[0]) keep(issue, parents[0], 1);
				else keep(issue, info, 2);
			}
			for (const parent of parents) {
				for (const issue of parent.issues) keep(issue, parent, 0);
			}
		} catch (error) {
			if (error instanceof RateLimitedError) throw error;
			warnings.push(
				`PR #${number}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
	const fixes = [...found.values()]
		.sort((a, b) => a.rank - b.rank)
		.map(({ issue, pr, sha }) => ({ issue, pr, sha }));
	return { prs: touched, fixes, warnings, notes };
}
