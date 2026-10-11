/**
 * The checks `file` makes around the filing itself: the application's own
 * repository must not be public (an issue number in its code or a tracking
 * issue would tie it to the anonymous report) unless the user agreed
 * (`--public-app`); a warning when no application domain is configured; and
 * what an earlier report with the same fingerprint means once it is closed —
 * released (bump instead) or fixed but not yet released (wait).
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { readDenyConfig } from './deny-sources';
import { GhError } from './github';
import type { IssueSummary } from './github-issues';
import { formatRepo, repoOfDirectory } from './repo-id';
import { gateFacts } from './resolve';
import { repoRoot } from './workspaces';

/** A refusal exit code when the application is public and the user did not agree. */
export async function refuseInPublicApp(
	ctx: CliContext,
	publicApp: boolean,
): Promise<ExitCode | undefined> {
	const app = repoOfDirectory(ctx.cwd);
	if (!app || publicApp) return undefined;
	try {
		if (!(await gateFacts(ctx, app)).private) {
			ctx.out(
				`refused: the application repository ${formatRepo(app)} is public; nothing was filed.`,
			);
			ctx.out(
				'  A report filed from it could be tied back to it (markers, tracking issue).',
			);
			ctx.out(
				'  Ask the user; only with their OK run file --public-app, and add no issue-number markers or tracking issue without it.',
			);
			return EXIT.refusedGate;
		}
	} catch (error) {
		// gh cannot see it: a public repository is visible to every token.
		if (error instanceof GhError && /not found|HTTP 404/i.test(error.stderr)) {
			return undefined;
		}
		throw error;
	}
	return undefined;
}

export function warnWithoutDomains(ctx: CliContext): void {
	if (readDenyConfig(ctx, repoRoot(ctx.cwd)).appDomains.length > 0) return;
	ctx.err(
		'warning: no application domain is configured (.nxgt-issues.json "appDomains", or NXGT_ISSUES_APP_DOMAINS); bare domains are still rewritten to <host>, but configure them so their names are denied too.',
	);
}

const released = (issue: IssueSummary): boolean =>
	(issue.labels ?? []).some((label) => label.name.toLowerCase() === 'released');

export type ClosedMatch = 'released' | 'awaiting-release' | 'open';

/** How a fingerprint match stands: open, closed and released, or closed awaiting its release. */
export function standing(issue: IssueSummary): ClosedMatch {
	if (issue.state.toUpperCase() !== 'CLOSED') return 'open';
	return released(issue) ? 'released' : 'awaiting-release';
}

export function printReleasedHint(
	ctx: CliContext,
	issue: IssueSummary,
): ExitCode {
	ctx.out(
		`released: #${issue.number} reported this and its fix is released (${issue.url}); nothing was filed.`,
	);
	ctx.out(
		'  Bump the package to the fixed release and remove the workaround. If it still fails on that release, run file --new.',
	);
	return EXIT.ok;
}

export function printAwaitingHint(ctx: CliContext, issue: IssueSummary): void {
	ctx.out(
		`  #${issue.number} is fixed but not released yet: wait for the release; keep the workaround and its marker.`,
	);
}
