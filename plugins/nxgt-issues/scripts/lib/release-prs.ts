/**
 * Which issues a published `<package>@<version>` fixes. The pull requests are
 * the `[#N]` links of the version's CHANGELOG section, plus the PRs named by
 * the commits that touched `packages/<dir>` since the package's previous tag
 * (kept only when they touch the package). Each PR gives its closing issues:
 * GitHub's `closingIssuesReferences`, then the closing keywords of its body.
 * A PR merged into a `feat/*` branch closes nothing by itself, so the
 * integration PR holding its merge commit is read too and named in the
 * "Fixed in" comment. Only issues of the library's own repository count.
 */

import { type GhContext, ghJson, RateLimitedError } from './github';
import { closingRefs } from './refs';
import { formatRepo, type RepoId, sameRepo } from './repo-id';

export interface ReleaseInput {
	readonly repo: RepoId;
	readonly pkg: string;
	readonly version: string;
	/** The package's folder, relative to the repository root (`packages/widget`). */
	readonly dir: string;
}

/** An issue the release fixes and the PR the comment names. */
export interface Fix {
	readonly issue: number;
	readonly pr: number;
}

export interface Discovery {
	/** The PRs found directly (CHANGELOG and git log), in order. */
	readonly prs: number[];
	readonly fixes: Fix[];
	readonly warnings: string[];
	readonly notes: string[];
}

interface PrInfo {
	readonly base: string;
	readonly mergeSha: string | undefined;
	readonly issues: number[];
	readonly files: string[];
}

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The `[#N]` PR links of the `## <version>` section of a changelog. */
export function changelogPrs(changelog: string, version: string): number[] {
	const lines = changelog.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim() === `## ${version}`);
	if (start === -1) return [];
	const rest = lines.slice(start + 1);
	const end = rest.findIndex((line) => line.startsWith('## '));
	const section = (end === -1 ? rest : rest.slice(0, end)).join('\n');
	return [...section.matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]));
}

/** The PR number a commit subject names: a merge commit or a squash `(#N)`. */
export function subjectPr(subject: string): number | undefined {
	const match =
		/^Merge pull request #(\d+)\b/.exec(subject) ??
		/\(#(\d+)\)\s*$/.exec(subject);
	return match?.[1] ? Number(match[1]) : undefined;
}

async function git(
	ctx: GhContext,
	args: readonly string[],
): Promise<string | undefined> {
	const result = await ctx.runner.run(['git', ...args], {
		...(ctx.cwd ? { cwd: ctx.cwd } : {}),
	});
	return result.code === 0 ? result.stdout : undefined;
}

async function readInfo(
	ctx: GhContext,
	repo: RepoId,
	number: number,
): Promise<PrInfo> {
	const raw = obj(
		await ghJson(ctx, [
			'pr',
			'view',
			String(number),
			'-R',
			formatRepo(repo),
			'--json',
			'number,baseRefName,body,closingIssuesReferences,mergeCommit,files',
		]),
	);
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
		base: String(raw['baseRefName'] ?? ''),
		mergeSha: typeof sha === 'string' ? sha : undefined,
		issues: [...issues],
		files: list(raw['files']).map((file) => String(obj(file)['path'] ?? '')),
	};
}

/** Merged PRs into a non-`feat/*` branch whose history holds `sha`. */
async function integrationPrs(
	ctx: GhContext,
	repo: RepoId,
	sha: string,
	own: number,
): Promise<number[]> {
	const out = await ghJson<unknown[]>(ctx, [
		'api',
		`repos/${formatRepo(repo)}/commits/${sha}/pulls`,
	]);
	return list(out).flatMap((item) => {
		const pr = obj(item);
		const base = String(obj(pr['base'])['ref'] ?? '');
		const number = Number(pr['number']);
		return pr['merged_at'] && !base.startsWith('feat/') && number !== own
			? [number]
			: [];
	});
}

/** The PR numbers a package's commits name, between its previous tag and this release. */
async function loggedPrs(
	ctx: GhContext,
	input: ReleaseInput,
	notes: string[],
): Promise<number[]> {
	const tag = `${input.pkg}@${input.version}`;
	const tags = (
		(await git(ctx, [
			'tag',
			'--list',
			`${input.pkg}@*`,
			'--sort=-version:refname',
		])) ?? ''
	)
		.split('\n')
		.map((name) => name.trim())
		.filter(Boolean);
	const at = tags.indexOf(tag);
	const previous = at === -1 ? tags[0] : tags[at + 1];
	if (!previous) {
		notes.push(`no earlier tag for ${input.pkg}: the CHANGELOG alone was read`);
		return [];
	}
	const range = `${previous}..${at === -1 ? 'HEAD' : tag}`;
	const log = await git(ctx, ['log', '--format=%s', range, '--', input.dir]);
	return (log ?? '')
		.split('\n')
		.flatMap((subject) => subjectPr(subject.trim()) ?? []);
}

export async function discoverFixes(
	ctx: GhContext,
	input: ReleaseInput,
): Promise<Discovery> {
	const warnings: string[] = [];
	const notes: string[] = [];
	const tag = `${input.pkg}@${input.version}`;
	const changelog =
		(await git(ctx, ['show', `${tag}:${input.dir}/CHANGELOG.md`])) ??
		(await git(ctx, ['show', `HEAD:${input.dir}/CHANGELOG.md`])) ??
		'';
	const listed = changelogPrs(changelog, input.version);
	const logged = await loggedPrs(ctx, input, notes);
	const prs = [...new Set([...listed, ...logged])];

	// rank: 0 an integration PR's own issues, 1 a slice's, named after its integration PR, 2 a slice with none yet
	const found = new Map<number, Fix & { rank: number }>();
	const keep = (issue: number, pr: number, rank: number) => {
		const known = found.get(issue);
		if (!known || rank < known.rank) found.set(issue, { issue, pr, rank });
	};
	const touched: number[] = [];
	for (const number of prs) {
		try {
			const info = await readInfo(ctx, input.repo, number);
			const inLog = !listed.includes(number);
			if (inLog && !info.files.some((f) => f.startsWith(`${input.dir}/`)))
				continue;
			touched.push(number);
			if (!info.base.startsWith('feat/')) {
				for (const issue of info.issues) keep(issue, number, 0);
				continue;
			}
			const parents = info.mergeSha
				? await integrationPrs(ctx, input.repo, info.mergeSha, number)
				: [];
			const named = parents[0];
			for (const issue of info.issues) {
				if (named === undefined) keep(issue, number, 2);
				else keep(issue, named, 1);
			}
			for (const parent of parents) {
				const up = await readInfo(ctx, input.repo, parent);
				for (const issue of up.issues) keep(issue, parent, 0);
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
		.map(({ issue, pr }) => ({ issue, pr }));
	return { prs: touched, fixes, warnings, notes };
}
