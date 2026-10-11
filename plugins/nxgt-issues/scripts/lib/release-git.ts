/**
 * The local git side of release discovery: the CHANGELOG section's PR links,
 * the PR numbers the first-parent log of a package names, and whether a merge
 * (or squash) commit touched the package. All through the injected runner.
 */

import type { GhContext } from './github';
import type { RepoId } from './repo-id';

export interface ReleaseInput {
	readonly repo: RepoId;
	readonly pkg: string;
	readonly version: string;
	/** The package's folder, relative to the repository root (`packages/widget`). */
	readonly dir: string;
}

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

/** `dir` is `.` for a package at the repository root. */
export const inDir = (dir: string, file: string): boolean =>
	dir === '.' || file.startsWith(`${dir}/`);
export const changelogPath = (dir: string): string =>
	dir === '.' ? 'CHANGELOG.md' : `${dir}/CHANGELOG.md`;

/** The PR number a commit subject names: a merge commit or a squash `(#N)`. */
export function subjectPr(subject: string): number | undefined {
	const match =
		/^Merge pull request #(\d+)\b/.exec(subject) ??
		/\(#(\d+)\)\s*$/.exec(subject);
	return match?.[1] ? Number(match[1]) : undefined;
}

export async function git(
	ctx: GhContext,
	args: readonly string[],
): Promise<string | undefined> {
	const result = await ctx.runner.run(['git', ...args], {
		...(ctx.cwd ? { cwd: ctx.cwd } : {}),
	});
	return result.code === 0 ? result.stdout : undefined;
}

/**
 * The PRs merged into the branch that touched `packages/<dir>` between the
 * package's previous tag and this release (`--first-parent`: the merge
 * commits of the branch, the integration PR included). Nothing when the tag is
 * not in this clone: a range to `HEAD` would pull in later releases.
 */
export async function loggedPrs(
	ctx: GhContext,
	input: ReleaseInput,
	notes: string[],
): Promise<number[]> {
	const named = `${input.pkg}@${input.version}`;
	// A root package of a single-package repository is tagged `v1.2.3` by changesets.
	const plain = input.dir === '.' ? `v${input.version}` : undefined;
	const listing = await git(ctx, [
		...['tag', '--list', `${input.pkg}@*`],
		...(plain ? ['v[0-9]*'] : []),
		'--sort=-version:refname',
	]);
	const all = (listing ?? '')
		.split('\n')
		.map((name) => name.trim())
		.filter(Boolean);
	const tag = all.includes(named)
		? named
		: plain && all.includes(plain)
			? plain
			: undefined;
	if (!tag) {
		notes.push(`tag ${named} not found locally: the CHANGELOG alone was read`);
		return [];
	}
	const tags = all.filter((t) =>
		tag === plain ? /^v\d/.test(t) : t.startsWith(`${input.pkg}@`),
	);
	const previous = tags[tags.indexOf(tag) + 1];
	if (!previous) {
		notes.push(`no earlier tag for ${input.pkg}: the CHANGELOG alone was read`);
		return [];
	}
	const log = await git(ctx, [
		'log',
		'--first-parent',
		'--format=%s',
		`${previous}..${tag}`,
		'--',
		input.dir,
	]);
	return (log ?? '')
		.split('\n')
		.flatMap((subject) => subjectPr(subject.trim()) ?? []);
}

/**
 * Whether a merge or squash commit changed `packages/<dir>`: `sha^1..sha` is the
 * PR's own change for both. Undefined when git cannot say (the commit is not
 * in this clone).
 */
export async function commitTouches(
	ctx: GhContext,
	sha: string,
	dir: string,
): Promise<boolean | undefined> {
	const out = await git(ctx, [
		'diff',
		'--name-only',
		`${sha}^1`,
		sha,
		'--',
		dir,
	]);
	return out === undefined ? undefined : out.trim() !== '';
}

/** The package names in a changeset file's frontmatter (`"@nxgt/x": minor`). */
export function changesetNames(text: string): string[] {
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
	return [...front.matchAll(/^["']?([^"':\n]+?)["']?\s*:/gm)].map(
		(m) => m[1] as string,
	);
}

/**
 * The packages the changesets a merge (or squash) commit added name: the ones
 * that will really be published with this PR in their log or CHANGELOG.
 * Undefined when git cannot say.
 */
export async function addedChangesetPackages(
	ctx: GhContext,
	sha: string,
): Promise<string[] | undefined> {
	const listing = await git(ctx, [
		...['diff', '--name-only', '--diff-filter=A', `${sha}^1`, sha],
		...['--', '.changeset/'],
	]);
	if (listing === undefined) return undefined;
	const names: string[] = [];
	for (const file of listing.split('\n').map((f) => f.trim())) {
		if (!file.endsWith('.md') || file.endsWith('README.md')) continue;
		const text = await git(ctx, ['show', `${sha}:${file}`]);
		if (text === undefined) return undefined;
		names.push(...changesetNames(text));
	}
	return names;
}
