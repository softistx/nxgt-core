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
	const tag = `${input.pkg}@${input.version}`;
	const listing = await git(ctx, [
		'tag',
		'--list',
		`${input.pkg}@*`,
		'--sort=-version:refname',
	]);
	const tags = (listing ?? '')
		.split('\n')
		.map((name) => name.trim())
		.filter(Boolean);
	const at = tags.indexOf(tag);
	if (at === -1) {
		notes.push(`tag ${tag} not found locally: the CHANGELOG alone was read`);
		return [];
	}
	const previous = tags[at + 1];
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
