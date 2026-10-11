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
	readonly siblings?: readonly string[];
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

/** Comment, label and close one issue, each only when it is not done yet. */
async function releaseIssue(
	ctx: GhContext,
	options: ReleaseOptions,
	issue: number,
	pr: number,
): Promise<IssueOutcome> {
	const repo = formatRepo(options.repo);
	const state = await readIssue(ctx, repo, issue);
	const named = versionNames(state.body);
	const other = named.find(
		(name) => name !== options.pkg && options.siblings?.includes(name),
	);
	if (other && !named.includes(options.pkg)) {
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
	for (const { issue, pr } of pending) {
		try {
			issues.push(await releaseIssue(ctx, options, issue, pr));
		} catch (error) {
			if (error instanceof RateLimitedError) throw error;
			warnings.push(`issue #${issue}: ${message(error)}`);
		}
	}
	let notify: Notify[] = [];
	if (issues.length > 0) {
		try {
			notify = await notifications(
				ctx,
				options,
				issues.map((i) => i.number),
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
