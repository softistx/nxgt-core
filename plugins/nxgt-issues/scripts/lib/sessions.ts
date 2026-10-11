/**
 * `issues.ts sessions <owner/repo>`: the live crew sessions whose repository
 * depends on a package published from `owner/repo`, so Claude can send each
 * one message after a filing (with ListAgents for the session names). A
 * session's dependencies are read from its manifests (root and workspaces),
 * and each dependency is mapped to its repository through the `repository`
 * field of the installed copy under `node_modules`. Nothing reaches out; no
 * crew registry means no session, not an error.
 */

import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import { type CrewSession, liveSessions } from './crew-registry';
import { parseIssueRef } from './refs';
import {
	parseRemote,
	parseRepositoryField,
	type RepoId,
	sameRepo,
} from './repo-id';
import { fromNodeModules } from './resolve';
import { dependenciesOf, manifestsOf } from './workspaces';

export interface Consumer {
	readonly session: CrewSession;
	readonly root: string;
	/** The dependencies published from the repository, as `name@range`. */
	readonly uses: readonly string[];
}

/** What `root`'s manifests declare that is published from `repo`. */
export function usesOf(root: string, repo: RepoId): string[] {
	const uses = new Set<string>();
	for (const manifest of manifestsOf(root)) {
		for (const [name, range] of dependenciesOf(manifest)) {
			const installed = fromNodeModules(manifest.dir, name);
			const from = parseRepositoryField(installed?.repository);
			if (from && sameRepo(from, repo)) uses.add(`${name}@${range}`);
		}
	}
	return [...uses].sort();
}

export function consumersOf(ctx: CliContext, repo: RepoId): Consumer[] {
	const self = ctx.env['NXGT_CREW_SESSION_ID'];
	const sessions = liveSessions(ctx.env, ctx.now(), self, ctx.probe);
	const consumers: Consumer[] = [];
	for (const session of sessions) {
		const own = session.remote ? parseRemote(session.remote) : undefined;
		if (own && sameRepo(own, repo)) continue;
		const root = session.worktree ?? session.cwd;
		const uses = usesOf(root, repo);
		if (uses.length > 0) consumers.push({ session, root, uses });
	}
	return consumers;
}

export function sessionsCommand(
	ctx: CliContext,
	target: string | undefined,
	json: boolean,
): ExitCode {
	const ref = target
		? parseIssueRef(`${target.replace(/#\d+$/, '')}#0`)
		: undefined;
	if (!ref?.repo) {
		ctx.err('sessions: give the package repository as owner/repo');
		return EXIT.usage;
	}
	const consumers = consumersOf(ctx, ref.repo);
	if (json) {
		ctx.out(JSON.stringify(consumers, null, 2));
		return EXIT.ok;
	}
	if (consumers.length === 0) {
		ctx.out(`no live session depends on ${target}`);
		return EXIT.ok;
	}
	for (const { session, root, uses } of consumers) {
		const name = session.title ? ` "${session.title}"` : '';
		const branch = session.branch ? ` (${session.branch})` : '';
		ctx.out(
			`${session.sessionId}${name} ${root}${branch} uses ${uses.join(', ')}`,
		);
	}
	return EXIT.ok;
}
