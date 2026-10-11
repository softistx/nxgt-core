/**
 * The SessionStart decision, with everything real injected so a spec drives it
 * with the fake runner. It fails open: whatever goes wrong, the answer is
 * "nothing to say" and the session starts as if the plugin were absent.
 *
 *   disabled, no checkout, or an origin outside the owner allowlist -> nothing,
 *     and not one runner call;
 *   fresh cache -> render it;
 *   stale cache -> render it "as of Nm ago" and start a detached refresh;
 *   no cache    -> one inline refresh capped at 800 ms (each gh call at 650, so
 *     the child ends before the hook does, and any call still in flight is
 *     killed on the way out), else nothing; over budget, the refresh is also
 *     started detached so the next start has a cache, and a failure leaves a
 *     10-minute stamp (no attempt meanwhile). A fresh `refreshing` stamp
 *     (a detached refresh is running) also means nothing: no inline attempt.
 */

import { cachePath, describeAge, readEntry } from './cache';
import { renderContext } from './context';
import { type GhContext, GhTimeout, rateLimitedUntil } from './github';
import { disabled } from './hook';
import { refreshRepo } from './refresh';
import { claimStamp, setStamp, stampFresh } from './refresh-state';
import {
	allowedOwners,
	isAllowedOwner,
	type RepoId,
	repoOfDirectory,
} from './repo-id';
import type { Runner } from './runner';
import { type Snapshot, snapshotFresh } from './snapshot';

export const COLD_BUDGET_MS = 800;
/** Each inline gh call ends this long before the budget does, so no child outlives the hook. */
const COLD_MARGIN_MS = 150;

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
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const budget = new Promise<'timeout'>((done) => {
		timer = setTimeout(() => done('timeout'), COLD_BUDGET_MS);
	});
	try {
		const capped: GhContext = {
			...ctx,
			timeoutMs: COLD_BUDGET_MS - COLD_MARGIN_MS,
			signal: controller.signal,
		};
		return await Promise.race([
			// A call the runner cut is a slow network, not a broken gh: no failed stamp, the detached refresh runs.
			refreshRepo(capped, id, owners).catch((error): 'failed' | 'timeout' =>
				error instanceof GhTimeout ? 'timeout' : 'failed',
			),
			budget,
		]);
	} finally {
		clearTimeout(timer);
		// Over budget or failed: no gh child may outlive the hook.
		controller.abort();
	}
}

/** Detached `issues.ts refresh`, unless one started under a minute ago. */
function startRefresh(deps: SessionStartDeps, id: RepoId): void {
	if (!claimStamp(deps.home, id, 'refreshing', deps.now())) return;
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
			const fresh = snapshotFresh({ ...entry, data: entry.data });
			if (!(fresh || idle)) startRefresh(deps, id);
			const age = fresh ? undefined : describeAge(entry.ageMs);
			return renderContext(entry.data, { now, ...(age ? { age } : {}) });
		}
		// A detached refresh is running (fresh stamp): it will fill the cache.
		if (idle || stampFresh(deps.home, id, 'refreshing', now)) return undefined;
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
