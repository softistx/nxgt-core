/**
 * `issues.ts dashboard [--json]`: every open issue of the allowed owners'
 * non-archived repositories, ranked per package, plus the fixes merged and
 * awaiting release. The three searches are the dashboard: if one fails the
 * command exits 5 (rate limit) or 6. The two GraphQL calls (duplicate counts,
 * package names; see `dashboard-data.ts` and `repo-packages.ts`) are optional
 * and degrade: the board is kept, `affected ?` and repository names stand in
 * for what was not read, and a note and a stderr warning say so.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { rankDashboard, renderDashboard } from './dashboard';
import {
	duplicateCounts,
	type Found,
	MAX_REPORTS,
	SEARCH_LIMIT,
	search,
	trackedUpstream,
} from './dashboard-data';
import { GhError, RateLimitedError } from './github';
import { allowedOwners } from './repo-id';
import { repoPackages } from './repo-packages';

/** Runs an optional lookup; a gh failure or rate limit gives the fallback, a note and a warning. */
async function optional<T>(
	ctx: CliContext,
	notes: string[],
	what: string,
	fallback: T,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (!(error instanceof GhError || error instanceof RateLimitedError)) {
			throw error;
		}
		ctx.err(`${what} unavailable (${error.message}).`);
		notes.push(`${what} unavailable; shown without them.`);
		return fallback;
	}
}

/** The repository to package names map; a repository it lacks is noted and shown by name. */
async function packageNames(
	ctx: CliContext,
	notes: string[],
	repos: readonly string[],
): Promise<Map<string, readonly string[]>> {
	const packages = await optional(
		ctx,
		notes,
		'package names',
		new Map<string, readonly string[]>(),
		() => repoPackages(ctx, repos),
	);
	const missing = repos.filter((repo) => !packages.has(repo));
	if (missing.length > 0) {
		ctx.err(`package names unavailable for ${missing.length} repositories.`);
		if (!notes.some((n) => n.startsWith('package names'))) {
			notes.push(
				`package names unavailable for ${missing.length} repositories; shown by repository name.`,
			);
		}
	}
	return packages;
}

export async function dashboardCommand(
	ctx: CliContext,
	json: boolean,
): Promise<ExitCode> {
	const owners = allowedOwners(ctx.env);
	const notes: string[] = [];
	const run = async (
		name: string,
		flags: string[],
		fields?: string,
		rest?: string[],
	): Promise<Found[]> => {
		const { found, full } = await search(ctx, owners, flags, fields, rest);
		if (full) {
			notes.push(
				`truncated: the ${name} search returned its ${SEARCH_LIMIT}-result limit; more exist.`,
			);
		}
		return found;
	};
	try {
		const open = await run('open-issues', ['--state', 'open']);
		const tracking = await run(
			'tracking-issues',
			['--state', 'open', '--label', 'upstream'],
			'number,title,labels,createdAt,updatedAt,repository,body',
		);
		const awaiting = await run(
			'awaiting-release',
			['--state', 'closed', '--label', 'consumer-report'],
			undefined,
			['--', '-label:released'],
		);
		const shown = open.filter((issue) => !issue.labels.includes('upstream'));
		const repos = [
			...new Set([...shown, ...awaiting].map((i) => i.repo)),
		].sort();
		const reports = shown.filter((i) => i.labels.includes('consumer-report'));
		const duplicates = await optional(
			ctx,
			notes,
			'duplicate counts',
			undefined,
			() => duplicateCounts(ctx, shown),
		);
		if (duplicates && reports.length > MAX_REPORTS) {
			notes.push(
				`duplicate counts cover the first ${MAX_REPORTS} reports; the others show affected ?.`,
			);
		}
		const packages = await packageNames(ctx, notes, repos);
		const board = rankDashboard({
			issues: open,
			trackedUpstream: trackedUpstream(tracking, owners),
			duplicates,
			packages,
			awaiting,
			notes,
			now: ctx.now(),
		});
		if (json) ctx.out(JSON.stringify(board, null, 2));
		else for (const line of renderDashboard(board, ctx.now())) ctx.out(line);
		return EXIT.ok;
	} catch (error) {
		ctx.err(error instanceof Error ? error.message : String(error));
		return error instanceof RateLimitedError ? EXIT.rateLimited : EXIT.failed;
	}
}
