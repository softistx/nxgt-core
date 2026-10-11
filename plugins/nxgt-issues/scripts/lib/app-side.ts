/**
 * The application's side of the loop: `issues.ts ready` lists the tracking
 * issues whose fix is released upstream (the rule is `adoptReady`, shared with
 * the SessionStart hook), `loadSnapshot` is the cache-or-refresh both
 * commands read the application's tracking issues through.
 */

import { cachePath, readEntry } from './cache';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { adoptReady, releaseFix } from './context';
import { RateLimitedError } from './github';
import { refreshRepo, type Snapshot } from './refresh';
import { allowedOwners, isAllowedOwner, repoOfDirectory } from './repo-id';

export interface ReadyIssue {
	readonly tracking: number;
	readonly title: string;
	/** `owner/repo#n` */
	readonly upstream: string;
	/** From the trusted `Fixed in <pkg>@<version>` comment, when it is the last one. */
	readonly package?: string;
	readonly version?: string;
}

/** The directory's repository snapshot: the cache when fresh, else a refresh; a failed refresh falls back to a stale entry. */
export async function loadSnapshot(
	ctx: CliContext,
): Promise<Snapshot | { exit: ExitCode }> {
	const id = repoOfDirectory(ctx.cwd);
	const owners = allowedOwners(ctx.env);
	if (!id || !isAllowedOwner(id.owner, owners)) {
		ctx.err('the origin is not a repository of an allowed owner.');
		return { exit: EXIT.refusedGate };
	}
	const cached = readEntry<Snapshot>(cachePath(ctx.home, id), ctx.now());
	if (cached?.fresh) return cached.data;
	try {
		return await refreshRepo(ctx, id, owners);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (cached) {
			ctx.err(`refresh failed (${message}); using the cache, possibly stale.`);
			return cached.data;
		}
		ctx.err(message);
		return {
			exit: error instanceof RateLimitedError ? EXIT.rateLimited : EXIT.failed,
		};
	}
}

export function readyIssues(snapshot: Snapshot): ReadyIssue[] {
	return adoptReady(snapshot.tracking).map((issue) => {
		const fix = releaseFix(issue);
		return {
			tracking: issue.number,
			title: issue.title,
			upstream: issue.upstream,
			...(fix ? { package: fix.package, version: fix.version } : {}),
		};
	});
}

/** `issues.ts ready [--json]`: tracking issues whose upstream is closed and released. */
export async function readyCommand(
	ctx: CliContext,
	json: boolean,
): Promise<ExitCode> {
	const snapshot = await loadSnapshot(ctx);
	if ('exit' in snapshot) return snapshot.exit;
	const ready = readyIssues(snapshot);
	if (json) {
		ctx.out(JSON.stringify(ready, null, 2));
		return EXIT.ok;
	}
	if (ready.length === 0) ctx.out('nothing to adopt: no released fix waits.');
	for (const issue of ready) {
		const fix = issue.version ? `, ${issue.package}@${issue.version}` : '';
		ctx.out(
			`tracking #${issue.tracking} ${issue.title} -> ${issue.upstream} (closed, released${fix})`,
		);
	}
	return EXIT.ok;
}
