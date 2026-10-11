/**
 * Reading pull requests for `release-prs.ts`: a PR as `gh` prints it, the
 * integration PRs of a `feat/*` branch, and whether a PR's merge touched the
 * package or already shipped in an earlier release.
 */

import { type GhContext, ghJson, RateLimitedError } from './github';
import { closingRefs } from './refs';
import { commitTouches, inDir, isAncestor } from './release-git';
import { formatRepo, type RepoId, sameRepo } from './repo-id';

export interface PrInfo {
	readonly number: number;
	readonly base: string;
	readonly head: string;
	readonly mergeSha: string | undefined;
	readonly mergedAt: string | undefined;
	readonly issues: number[];
	readonly files: string[];
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const FIELDS =
	'number,baseRefName,headRefName,body,closingIssuesReferences,mergeCommit,mergedAt,files';

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
		mergedAt: typeof raw['mergedAt'] === 'string' ? raw['mergedAt'] : undefined,
		issues: [...issues],
		files: list(raw['files']).map((file) => String(obj(file)['path'] ?? '')),
	};
}

export async function readInfo(
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
export async function touchesPackage(
	ctx: GhContext,
	info: PrInfo,
	dir: string,
): Promise<boolean> {
	const byGit = info.mergeSha
		? await commitTouches(ctx, info.mergeSha, dir)
		: undefined;
	return byGit ?? info.files.some((file) => inDir(dir, file));
}

/**
 * Whether an integration PR shipped in an earlier release: a branch that is
 * reused is listed with every merge it ever had. Its merge commit being an
 * ancestor of the previous tag says so; with no previous tag, or when git
 * cannot say, a merge older than the slice does.
 */
async function releasedBefore(
	ctx: GhContext,
	parent: PrInfo,
	since: { previous?: string | undefined; mergedAt?: string | undefined },
): Promise<boolean> {
	const shipped =
		parent.mergeSha && since.previous
			? await isAncestor(ctx, parent.mergeSha, since.previous)
			: undefined;
	if (shipped !== undefined) return shipped;
	return Boolean(
		parent.mergedAt && since.mergedAt && parent.mergedAt < since.mergedAt,
	);
}

/** The PRs that merged `base` on and touched the package, released before or not. */
export async function touchingIntegrationPrs(
	ctx: GhContext,
	repo: RepoId,
	base: string,
	dir: string,
): Promise<PrInfo[]> {
	const touching: PrInfo[] = [];
	for (const parent of await integrationPrs(ctx, repo, base)) {
		if (await touchesPackage(ctx, parent, dir)) touching.push(parent);
	}
	return touching;
}

const message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The integration PRs of a slice's branch that were not released before. The
 * PRs of a branch are looked up once per branch, but "released before" is
 * judged per slice, against that slice's own merge date; none when the lookup
 * fails (a warning, and the issues then name the slice PR).
 */
export function parentLookup(
	ctx: GhContext,
	input: { repo: RepoId; dir: string },
	previous: string | undefined,
	warnings: string[],
): (slice: PrInfo) => Promise<PrInfo[]> {
	const branches = new Map<string, PrInfo[]>();
	return async (slice) => {
		let candidates = branches.get(slice.base);
		if (!candidates) {
			const { repo, dir } = input;
			candidates = await touchingIntegrationPrs(
				ctx,
				repo,
				slice.base,
				dir,
			).catch((error) => {
				if (error instanceof RateLimitedError) throw error;
				warnings.push(`integration PR of ${slice.base}: ${message(error)}`);
				return [];
			});
			branches.set(slice.base, candidates);
		}
		const since = { previous, mergedAt: slice.mergedAt };
		const parents: PrInfo[] = [];
		for (const parent of candidates) {
			if (!(await releasedBefore(ctx, parent, since))) parents.push(parent);
		}
		return parents;
	};
}
