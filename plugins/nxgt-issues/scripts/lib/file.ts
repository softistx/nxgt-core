/**
 * `issues.ts file`: the anonymous report on a package's repository. Resolve
 * and gate the package, build the deny-list once, render the issue and the
 * "another consumer" comment, scrub the RENDERED texts and refuse on any hit;
 * then dedupe: the fingerprint first (an exact earlier report gets the
 * comment), then a keyword search whose candidates are printed for Claude to
 * judge (`--duplicate-of <n>` comments there, `--new` files anyway). Otherwise
 * the missing labels are created and the issue filed; its URL is printed. A
 * `dependencies` report goes to the one rolling issue instead (`deps.ts`).
 * Before all that, a public application repository refuses unless
 * `--public-app`; a closed match is handled per `file-checks.ts`.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { filingDenyList } from './deny-sources';
import { upsertRollingIssue } from './deps';
import {
	printAwaitingHint,
	printReleasedHint,
	refuseInPublicApp,
	standing,
} from './file-checks';
import {
	allowFor,
	checkTexts,
	exitForError,
	printGateRefusal,
	printScrubRefusal,
} from './filing';
import { extractFingerprint, fingerprint } from './fingerprint';
import {
	commentIssue,
	createIssue,
	type IssueSummary,
	issuesWithLabel,
	searchIssues,
} from './github-issues';
import { duplicateComment, packageIssueBody } from './issue-body';
import { ensureLabels } from './labels';
import { type IssueReport, parseReport } from './report';
import type { Resolved } from './resolve';
import { resolvePackage } from './resolve';
import type { DenyList } from './scrub';

export interface FileFlags {
	/** Comment on this issue: Claude judged a keyword candidate a duplicate. */
	readonly duplicateOf?: number | undefined;
	/** File even though keyword candidates exist, or the same report is closed and released. */
	readonly force?: boolean | undefined;
	/** The application's repository is public and the user agreed to file from it. */
	readonly publicApp?: boolean | undefined;
}

/** At most six plain words of the (scrubbed) keywords or title. */
export function searchQuery(text: string): string {
	return text
		.split(/\s+/)
		.map((word) => word.replace(/^[^\w@]+|[^\w]+$/g, ''))
		.filter((word) => /^[\w@./-]{3,}$/.test(word))
		.slice(0, 6)
		.join(' ');
}

function render(report: IssueReport) {
	const hash = fingerprint(report.package, report.kind, report.symptom);
	return {
		hash,
		texts: {
			title: report.title,
			body: packageIssueBody({ fingerprint: hash, ...report }),
			comment: duplicateComment(report),
			search:
				report.keywords.length > 0 ? report.keywords.join(' ') : report.title,
		},
	};
}

async function commentOn(
	ctx: CliContext,
	resolved: Resolved,
	issue: Pick<IssueSummary, 'number'> & Partial<IssueSummary>,
	comment: string,
): Promise<ExitCode> {
	const url = await commentIssue(ctx, resolved.repo, issue.number, comment);
	const state = issue.state ? `, ${issue.state.toLowerCase()}` : '';
	ctx.out(
		`commented ${url || `#${issue.number}`} (duplicate of #${issue.number}${state})`,
	);
	return EXIT.ok;
}

function printCandidates(ctx: CliContext, candidates: readonly IssueSummary[]) {
	ctx.out(
		'candidates: open issues that may report the same thing; nothing was filed.',
	);
	for (const issue of candidates) {
		ctx.out(`  #${issue.number} ${issue.title} ${issue.url}`);
	}
	ctx.out(
		'  Read them. Same problem: file --duplicate-of <n>. Different: file --new.',
	);
	return EXIT.candidates;
}

export async function fileIssue(
	ctx: CliContext,
	resolved: Resolved,
	report: IssueReport,
	denyList: DenyList,
	flags: FileFlags,
): Promise<ExitCode> {
	const { hash, texts } = render(report);
	const checked = checkTexts(texts, {
		cwd: ctx.cwd,
		denyList,
		allow: allowFor(resolved, ctx.cwd),
	});
	if (!checked.ok) return printScrubRefusal(ctx, checked);
	const { title, body, comment, search } = checked.texts;
	const reports = await issuesWithLabel(ctx, resolved.repo, 'consumer-report');
	const same = reports.find((issue) => extractFingerprint(issue.body) === hash);
	const sameStanding = same ? standing(same) : undefined;
	if (same && sameStanding === 'released' && !flags.force) {
		return printReleasedHint(ctx, same);
	}
	if (same && sameStanding !== 'released') {
		const code = await commentOn(ctx, resolved, same, comment);
		if (sameStanding === 'awaiting-release') printAwaitingHint(ctx, same);
		return code;
	}
	if (flags.duplicateOf !== undefined) {
		return commentOn(ctx, resolved, { number: flags.duplicateOf }, comment);
	}
	if (!flags.force) {
		const query = searchQuery(search);
		const candidates = query
			? await searchIssues(ctx, resolved.repo, query)
			: [];
		if (candidates.length > 0) return printCandidates(ctx, candidates);
	}
	const labels = [report.kind, 'consumer-report'];
	await ensureLabels(ctx, resolved.repo, labels);
	const url = await createIssue(ctx, resolved.repo, { title, body, labels });
	ctx.out(`filed ${url}`);
	return EXIT.ok;
}

export async function fileCommand(
	ctx: CliContext,
	flags: FileFlags,
): Promise<ExitCode> {
	const report = parseReport(await ctx.stdin());
	if ('problems' in report) {
		for (const problem of report.problems) ctx.err(`file: ${problem}`);
		return EXIT.usage;
	}
	try {
		const publicApp = await refuseInPublicApp(ctx, flags.publicApp === true);
		if (publicApp !== undefined) return publicApp;
		const resolved = await resolvePackage(ctx, report.package);
		if (!resolved.ok) return printGateRefusal(ctx, resolved);
		const denyList = await filingDenyList(ctx);
		if (report.kind === 'dependencies') {
			return await upsertRollingIssue(
				ctx,
				resolved,
				report.dependencies,
				denyList,
			);
		}
		return await fileIssue(ctx, resolved, report, denyList, flags);
	} catch (error) {
		return exitForError(ctx, error);
	}
}
