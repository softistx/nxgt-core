/**
 * The SessionStart decision, with everything real injected so a spec drives it
 * with the fake runner. It fails open: whatever goes wrong, the answer is
 * "nothing to say" and the session starts as if the plugin were absent.
 *
 *   disabled, no checkout, or an origin outside the owner allowlist -> nothing,
 *     and not one runner call;
 *   fresh cache -> render it;
 *   stale cache -> render it "as of Nm ago" and start a detached refresh;
 *   no cache    -> one inline refresh capped at 800 ms, else nothing; over
 *     budget, the refresh is also started detached so the next start has a
 *     cache, and a failure leaves a 10-minute stamp (no attempt meanwhile).
 */

import { cachePath, describeAge, readEntry } from './cache';
import { renderContext } from './context';
import { type GhContext, rateLimitedUntil } from './github';
import { disabled } from './hook';
import { refreshRepo, type Snapshot } from './refresh';
import { setStamp, stampFresh } from './refresh-state';
import {
	allowedOwners,
	isAllowedOwner,
	type RepoId,
	repoOfDirectory,
} from './repo-id';
import type { Runner } from './runner';

export const COLD_BUDGET_MS = 800;

export interface SessionStartDeps {
	readonly runner: Runner;
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;
	readonly home: string;
	readonly now: () => number;
	/** The command that refreshes this checkout's cache (run detached). */
	readonly refreshCommand: readonly string[];
}

const isSnapshot = (value: unknown): value is Snapshot =>
	!!value &&
	typeof value === 'object' &&
	Array.isArray((value as Snapshot).issues) &&
	Array.isArray((value as Snapshot).tracking) &&
	typeof (value as Snapshot).repo === 'string';

type Cold = Snapshot | 'timeout' | 'failed';

async function coldRefresh(
	ctx: GhContext,
	id: RepoId,
	owners: readonly string[],
): Promise<Cold> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const budget = new Promise<'timeout'>((done) => {
		timer = setTimeout(() => done('timeout'), COLD_BUDGET_MS);
	});
	try {
		const capped = { ...ctx, timeoutMs: COLD_BUDGET_MS };
		return await Promise.race([
			refreshRepo(capped, id, owners).catch((): 'failed' => 'failed'),
			budget,
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** Detached `issues.ts refresh`, unless one started under a minute ago. */
function startRefresh(deps: SessionStartDeps, id: RepoId): void {
	if (stampFresh(deps.home, id, 'refreshing', deps.now())) return;
	setStamp(deps.home, id, 'refreshing', deps.now());
	// Detached: the session never waits for it, and a failure is its own.
	deps.runner
		.run(deps.refreshCommand, { detached: true, cwd: deps.cwd })
		.catch(() => undefined);
}

/** The `additionalContext` text for this session, or undefined. */
export async function sessionStartContext(
	deps: SessionStartDeps,
): Promise<string | undefined> {
	try {
		if (disabled(deps.env)) return undefined;
		const id = repoOfDirectory(deps.cwd);
		const owners = allowedOwners(deps.env);
		if (!id || !isAllowedOwner(id.owner, owners)) return undefined;
		const now = deps.now();
		const ctx: GhContext = {
			runner: deps.runner,
			home: deps.home,
			now: deps.now,
			cwd: deps.cwd,
		};
		// A rate-limit pause or a refresh that just failed: use what is cached.
		const idle =
			rateLimitedUntil(deps.home, now) !== undefined ||
			stampFresh(deps.home, id, 'failed', now);
		const entry = readEntry<unknown>(cachePath(deps.home, id), now);
		if (entry && isSnapshot(entry.data)) {
			if (!(entry.fresh || idle)) startRefresh(deps, id);
			const age = entry.fresh ? undefined : describeAge(entry.ageMs);
			return renderContext(entry.data, { now, ...(age ? { age } : {}) });
		}
		if (idle) return undefined;
		const cold = await coldRefresh(ctx, id, owners);
		if (cold === 'failed') setStamp(deps.home, id, 'failed', deps.now());
		if (cold === 'timeout') startRefresh(deps, id);
		return typeof cold === 'string'
			? undefined
			: renderContext(cold, { now: deps.now() });
	} catch {
		return undefined;
	}
}
