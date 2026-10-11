/** `issues.ts refresh`: the cache entry of the directory's repository, refreshed. */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { exitForError } from './filing';
import { refreshRepo } from './refresh';
import { setStamp } from './refresh-state';
import { allowedOwners, isAllowedOwner, repoOfDirectory } from './repo-id';

export async function refreshCommand(ctx: CliContext): Promise<ExitCode> {
	const id = repoOfDirectory(ctx.cwd);
	const owners = allowedOwners(ctx.env);
	if (!id || !isAllowedOwner(id.owner, owners)) {
		ctx.err('refresh: the origin is not a repository of an allowed owner.');
		return EXIT.refusedGate;
	}
	try {
		const snapshot = await refreshRepo(ctx, id, owners);
		ctx.out(
			`${snapshot.repo}: ${snapshot.issues.length} open issue(s), ${snapshot.tracking.length} tracking issue(s) cached`,
		);
		return EXIT.ok;
	} catch (error) {
		setStamp(ctx.home, id, 'failed', ctx.now());
		return exitForError(ctx, error);
	}
}
