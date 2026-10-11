/**
 * `issues.ts dashboard [--json]`: every open issue of the allowed owners'
 * non-archived repositories, ranked per package, plus the fixes merged and
 * awaiting release. Three searches and one GraphQL call at most (see
 * `dashboard-data.ts`) plus the bounded, 24-hour-cached package lookups.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { rankDashboard, renderDashboard } from './dashboard';
import { duplicateCounts, search, trackedUpstream } from './dashboard-data';
import { GhError, RateLimitedError } from './github';
import { allowedOwners } from './repo-id';
import { repoPackages } from './repo-packages';

export async function dashboardCommand(
	ctx: CliContext,
	json: boolean,
): Promise<ExitCode> {
	const owners = allowedOwners(ctx.env);
	try {
		const open = await search(ctx, owners, ['--state', 'open']);
		const tracking = await search(
			ctx,
			owners,
			['--state', 'open', '--label', 'upstream'],
			'number,title,labels,createdAt,updatedAt,repository,body',
		);
		const awaiting = await search(
			ctx,
			owners,
			['--state', 'closed', '--label', 'consumer-report'],
			undefined,
			['--', '-label:released'],
		);
		let duplicates = new Map<string, number>();
		try {
			duplicates = await duplicateCounts(ctx, open);
		} catch (error) {
			if (!(error instanceof GhError)) throw error;
			ctx.err(`duplicate counts unavailable (${error.message}).`);
		}
		const repos = [...new Set(open.map((issue) => issue.repo))].sort();
		const board = rankDashboard({
			issues: open,
			trackedUpstream: trackedUpstream(tracking, owners),
			duplicates,
			packages: await repoPackages(ctx, repos),
			awaiting,
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
