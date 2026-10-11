/**
 * The release step: for each issue a published `<package>@<version>` fixes,
 * once and only once, a "Fixed in" comment, the `released` label, and the
 * close; then the tracking issues in the applications that link them, which
 * are the sessions to notify. Every call goes through the injected runner. A
 * failure on one PR or issue is a warning and the others go on, except a rate
 * limit, which stops the run. `--dry-run` reads everything and writes nothing.
 */

import { type GhContext, gh, RateLimitedError } from './github';
import { commentIssue } from './github-issues';
import { fixedComment, versionNames } from './issue-body';
import { commitTouches } from './release-git';
import {
	FIXED_MARKER,
	labelCreated,
	type Notify,
	notifications,
	readIssue,
} from './release-github';
import { discoverFixes, type ReleaseInput } from './release-prs';
import { formatRepo } from './repo-id';

export interface ReleaseOptions extends ReleaseInput {
	readonly owners: readonly string[];
	readonly dryRun: boolean;
	/** The names of every package of this repository: an issue naming another one is left to its run. */
	readonly siblings?: readonly {
		readonly name: string;
		readonly dir: string;
	}[];
}

export interface IssueOutcome {
	readonly number: number;
	readonly pr: number;
	/** Done, or in a dry run what would be done. */
	readonly commented: boolean;
	readonly labelled: boolean;
	readonly closed: boolean;
	/** The release comment is there and the issue is open: it was reopened, so it is not closed again. */
	readonly reopened: boolean;
	/** The issue names another package of the repository: that package's run comments. */
	readonly skipped: boolean;
	/** The other package of the repository a skipped issue names. */
	readonly leftTo?: string;
}

export interface ReleaseReport {
	readonly package: string;
	readonly version: string;
	readonly repo: string;
	readonly dryRun: boolean;
	readonly prs: number[];
	readonly issues: IssueOutcome[];
	readonly labelCreated: boolean;
	readonly notify: Notify[];
	readonly warnings: string[];
	readonly notes: string[];
}

const message = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The other package of this repository an issue names, when the fixing PR also
 * touched it: that package's run comments, so this one leaves the issue. A
 * named package the PR did not touch (or that git cannot say) never gets a run
 * that finds the issue, so it is handled here.
 */
async function leftTo(
	ctx: GhContext,
	options: ReleaseOptions,
	named: readonly string[],
	sha: string | undefined,
): Promise<string | undefined> {
	if (!sha || named.includes(options.pkg)) return undefined;
	for (const sibling of options.siblings ?? []) {
		if (sibling.name === options.pkg || !named.includes(sibling.name)) continue;
		if ((await commitTouches(ctx, sha, sibling.dir)) === true)
			return sibling.name;
	}
	return undefined;
}

/** Comment, label and close one issue, each only when it is not done yet. */
async function releaseIssue(
	ctx: GhContext,
	options: ReleaseOptions,
	issue: number,
	pr: number,
	sha: string | undefined,
): Promise<IssueOutcome> {
	const repo = formatRepo(options.repo);
	const state = await readIssue(ctx, repo, issue);
	const named = versionNames(state.body);
	const other = await leftTo(ctx, options, named, sha);
	if (other) {
		return {
			number: issue,
			pr,
			commented: false,
			labelled: false,
			closed: false,
			reopened: false,
			skipped: true,
			leftTo: other,
		};
	}
	const body = fixedComment(options.pkg, options.version, pr);
	// At most one "Fixed in" comment ever: a trusted comment carrying a fixed marker, whatever package, version or PR, means done.
	const done = state.comments.some(
		(c) => c.trusted && FIXED_MARKER.test(c.body),
	);
	const commented = !done;
	const labelled = !state.labelled;
	const closed = state.open && !done;
	const reopened = state.open && done;
	if (!options.dryRun) {
		// The comment, which is the marker, goes last: a failure before it leaves the step to be redone, never an issue "reopened".
		if (labelled) {
			await gh(ctx, [
				...['issue', 'edit', String(issue), '-R', repo],
				...['--add-label', 'released'],
			]);
		}
		if (closed) await gh(ctx, ['issue', 'close', String(issue), '-R', repo]);
		if (commented) await commentIssue(ctx, options.repo, issue, body);
	}
	return {
		number: issue,
		pr,
		commented,
		labelled,
		closed,
		reopened,
		skipped: false,
	};
}

export async function releasePackage(
	ctx: GhContext,
	options: ReleaseOptions,
): Promise<ReleaseReport> {
	const found = await discoverFixes(ctx, options);
	const warnings = [...found.warnings];
	const issues: IssueOutcome[] = [];
	let created = false;
	const pending = found.fixes;
	try {
		if (pending.length > 0) created = await labelCreated(ctx, options);
	} catch (error) {
		if (error instanceof RateLimitedError) throw error;
		warnings.push(`label released: ${message(error)}`);
		pending.length = 0;
	}
	for (const { issue, pr, sha } of pending) {
		try {
			issues.push(await releaseIssue(ctx, options, issue, pr, sha));
		} catch (error) {
			if (error instanceof RateLimitedError) throw error;
			warnings.push(`issue #${issue}: ${message(error)}`);
		}
	}
	let notify: Notify[] = [];
	const released = issues.filter((i) => !i.skipped);
	if (released.length > 0) {
		try {
			notify = await notifications(
				ctx,
				options,
				released.map((i) => i.number),
			);
		} catch (error) {
			if (error instanceof RateLimitedError) throw error;
			warnings.push(`tracking issues: ${message(error)}`);
		}
	}
	return {
		package: options.pkg,
		version: options.version,
		repo: formatRepo(options.repo),
		dryRun: options.dryRun,
		prs: found.prs,
		issues,
		labelCreated: created,
		notify,
		warnings,
		notes: [
			...found.notes,
			...issues
				.filter((i) => i.skipped)
				.map(
					(i) =>
						`#${i.number} names ${i.leftTo}, another package of this repository: that package's run will comment`,
				),
			...issues
				.filter((i) => i.reopened)
				.map(
					(i) =>
						`#${i.number} was reopened after the release: not closed again`,
				),
		],
	};
}
