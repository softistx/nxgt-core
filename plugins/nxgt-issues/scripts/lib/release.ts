/**
 * The release step: for each issue a published `<package>@<version>` fixes,
 * once and only once, a "Fixed in" comment, the `released` label, and the
 * close; then the tracking issues in the applications that link them, which
 * are the sessions to notify. Every call goes through the injected runner. A
 * failure on one PR or issue is a warning and the others go on, except a rate
 * limit, which stops the run. `--dry-run` reads everything and writes nothing.
 */

import { TRUSTED } from './context';
import { search } from './dashboard-data';
import { type GhContext, gh, ghJson, RateLimitedError } from './github';
import { commentIssue, labelNames } from './github-issues';
import { fixedComment } from './issue-body';
import { ensureLabels } from './labels';
import { upstreamRef } from './refs';
import { discoverFixes, type ReleaseInput } from './release-prs';
import { formatRepo, sameRepo } from './repo-id';

export interface ReleaseOptions extends ReleaseInput {
	readonly owners: readonly string[];
	readonly dryRun: boolean;
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
}

export interface Notify {
	readonly tracking: string;
	readonly title: string;
	readonly url: string;
	readonly upstream: string;
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

const BOT = 'github-actions';
const FIXED_MARKER = /<!--\s*nxgt-issues:fixed=\S+@\S+\s*-->/;
type Rows = Record<string, unknown>[];
const rows = (value: unknown): Rows =>
	Array.isArray(value) ? (value as Rows) : [];

interface IssueState {
	readonly open: boolean;
	readonly labelled: boolean;
	readonly comments: { trusted: boolean; body: string }[];
}

async function readIssue(
	ctx: GhContext,
	repo: string,
	number: number,
): Promise<IssueState> {
	const raw = await ghJson<Record<string, unknown>>(ctx, [
		'issue',
		'view',
		String(number),
		'-R',
		repo,
		'--json',
		'number,state,labels,comments',
	]);
	return {
		open: String(raw['state']).toUpperCase() === 'OPEN',
		labelled: rows(raw['labels']).some(
			(label) => String(label['name']).toLowerCase() === 'released',
		),
		comments: rows(raw['comments']).map((comment) => {
			const author = comment['author'] as { login?: string } | null;
			return {
				body: String(comment['body'] ?? ''),
				trusted:
					TRUSTED.has(String(comment['authorAssociation'])) ||
					author?.login === BOT,
			};
		}),
	};
}

/** Whether the `released` label is (or in a dry run would be) created. */
async function labelCreated(
	ctx: GhContext,
	options: ReleaseOptions,
): Promise<boolean> {
	if (!options.dryRun) {
		return (await ensureLabels(ctx, options.repo, ['released'])).length > 0;
	}
	const present = await labelNames(ctx, options.repo);
	return !present.some((name) => name.toLowerCase() === 'released');
}

async function notifications(
	ctx: GhContext,
	options: ReleaseOptions,
	issues: readonly number[],
): Promise<Notify[]> {
	const { found } = await search(
		ctx,
		options.owners,
		['--label', 'upstream', '--state', 'open'],
		'number,title,repository,body',
	);
	return found.flatMap((tracking) => {
		const ref = upstreamRef(tracking.body ?? '');
		if (!ref || !sameRepo(ref.repo, options.repo)) return [];
		if (!issues.includes(ref.number)) return [];
		return [
			{
				tracking: `${tracking.repo}#${tracking.number}`,
				title: tracking.title,
				url: `https://github.com/${tracking.repo}/issues/${tracking.number}`,
				upstream: `${formatRepo(ref.repo)}#${ref.number}`,
			},
		];
	});
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
		if (commented) await commentIssue(ctx, options.repo, issue, body);
		if (labelled) {
			await gh(ctx, [
				...['issue', 'edit', String(issue), '-R', repo],
				...['--add-label', 'released'],
			]);
		}
		if (closed) await gh(ctx, ['issue', 'close', String(issue), '-R', repo]);
	}
	return { number: issue, pr, commented, labelled, closed, reopened };
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
				.filter((i) => i.reopened)
				.map(
					(i) =>
						`#${i.number} was reopened after the release: not closed again`,
				),
		],
	};
}
