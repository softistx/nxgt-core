/**
 * Which issues a published `<package>@<version>` fixes. The pull requests are
 * the `[#N]` links of the version's CHANGELOG section that touched the package,
 * plus the PRs the first-parent log of `packages/<dir>` names since the
 * package's previous tag (merged PRs, the integration PR included). Each PR
 * gives its closing issues: GitHub's `closingIssuesReferences`, then the
 * closing keywords of its body outside code and quotes. A PR merged into a
 * `feat/*` branch closes nothing by itself, so the merged PR from that branch
 * into the default branch (found by its head branch) is read too and named in
 * the "Fixed in" comment, unless it merged in an earlier release (a reused
 * branch). A listed slice that did not touch the package still leads to its
 * integration PR, whose own issues count at rank 0 when that merge touched the
 * package. Only issues of the library's own repository count.
 */

import { type GhContext, RateLimitedError } from './github';
import {
	changelogPath,
	changelogPrs,
	git,
	loggedPrs,
	type ReleaseInput,
} from './release-git';

export type { ReleaseInput };

import {
	type PrInfo,
	parentLookup,
	readInfo,
	touchesPackage,
} from './release-pr-info';

/** An issue the release fixes and the PR the comment names. */
export interface Fix {
	readonly issue: number;
	readonly pr: number;
	/** The merge commit of that PR, when GitHub gave one. */
	readonly sha?: string | undefined;
	/** 0: the PR's own closing references name the issue; 1: a slice's, named after its integration PR; 2: a slice with none yet. */
	readonly rank: number;
}

export interface Discovery {
	/** The PRs found directly (CHANGELOG and git log), in order. */
	readonly prs: number[];
	readonly fixes: Fix[];
	readonly warnings: string[];
	readonly notes: string[];
}

export async function discoverFixes(
	ctx: GhContext,
	input: ReleaseInput,
): Promise<Discovery> {
	const warnings: string[] = [];
	const notes: string[] = [];
	const tag = `${input.pkg}@${input.version}`;
	const changelog =
		(await git(ctx, [
			'show',
			'--no-textconv',
			`${tag}:${changelogPath(input.dir)}`,
		])) ??
		(await git(ctx, [
			'show',
			'--no-textconv',
			`HEAD:${changelogPath(input.dir)}`,
		])) ??
		'';
	const listed = changelogPrs(changelog, input.version);
	const { prs: logged, previous } = await loggedPrs(ctx, input, notes);
	const prs = [...new Set([...listed, ...logged])];

	// rank: 0 an integration PR's own issues, 1 a slice's, named after its integration PR, 2 a slice with none yet
	const found = new Map<number, Fix & { rank: number }>();
	const keep = (issue: number, pr: PrInfo, rank: number, sha = pr.mergeSha) => {
		const known = found.get(issue);
		if (!known || rank < known.rank) {
			found.set(issue, { issue, pr: pr.number, sha, rank });
		}
	};
	const parentsOf = parentLookup(ctx, input, previous, warnings);
	const touched: number[] = [];
	const count = (number: number) => {
		if (!touched.includes(number)) touched.push(number);
	};
	for (const number of prs) {
		try {
			const info = await readInfo(ctx, input.repo, number);
			if (info.head.startsWith('changeset-release/')) continue;
			// The path-limited log proves a logged PR touched the package; a listed one may belong to another.
			const mine =
				logged.includes(number) || (await touchesPackage(ctx, info, input.dir));
			if (!(mine || info.base.startsWith('feat/'))) continue;
			if (!info.base.startsWith('feat/')) {
				count(number);
				for (const issue of info.issues) keep(issue, info, 0);
				continue;
			}
			// A slice that did not touch the package still leads to its integration PR: changelog-github credits the slice, and the integration PR's own `Fixes` would be missed.
			const parents = await parentsOf(info);
			if (mine) {
				count(number);
				for (const issue of info.issues) {
					if (parents[0]) keep(issue, parents[0], 1);
					else keep(issue, info, 2);
				}
			}
			for (const parent of parents) {
				count(parent.number);
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
		.map(({ issue, pr, sha, rank }) => ({ issue, pr, sha, rank }));
	return { prs: touched, fixes, warnings, notes };
}
