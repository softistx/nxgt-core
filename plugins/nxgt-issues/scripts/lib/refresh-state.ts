/**
 * Two short-lived stamps beside a cache entry, so the hook neither retries a
 * refresh that just failed nor starts a second one while one is running:
 * `failed` (10 minutes: no attempt at all, the hook renders what it has) and
 * `refreshing` (60 seconds: no second detached refresh). Every function
 * swallows its errors; a stamp is an optimisation, never a reason to fail.
 */

import { closeSync, openSync, rmSync, statSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { cachePath, makePrivateDir, readEntry, writeEntry } from './cache';
import type { RepoId } from './repo-id';

export type StampKind = 'failed' | 'refreshing';

const TTL_MS: Record<StampKind, number> = {
	failed: 10 * 60 * 1000,
	refreshing: 60 * 1000,
};

/** `cache/stamps/<owner>__<repo>.<kind>.json`: a folder of their own, so no repository name can make a stamp path equal a cache path. */
export const stampPath = (home: string, id: RepoId, kind: StampKind): string =>
	join(
		dirname(cachePath(home, id)),
		'stamps',
		basename(cachePath(home, id)).replace(/\.json$/, `.${kind}.json`),
	);

export function stampFresh(
	home: string,
	id: RepoId,
	kind: StampKind,
	now: number,
): boolean {
	try {
		return (
			readEntry(stampPath(home, id, kind), now, TTL_MS[kind])?.fresh === true
		);
	} catch {
		return false;
	}
}

export function setStamp(
	home: string,
	id: RepoId,
	kind: StampKind,
	now: number,
): void {
	try {
		writeEntry(stampPath(home, id, kind), {}, now);
	} catch {
		// an unwritable home only costs a retry
	}
}

/** A stamp file nobody could parse (being written, or damaged) is as young as its modification time says. */
function stampTaken(path: string, kind: StampKind, now: number): boolean {
	const entry = readEntry(path, now, TTL_MS[kind]);
	if (entry) return entry.fresh;
	try {
		return Math.abs(now - statSync(path).mtimeMs) < TTL_MS[kind];
	} catch {
		return false;
	}
}

/**
 * Takes the stamp, exclusively: the file is created with the `wx` flag, so of
 * several hooks starting at once exactly one gets `true` and spawns the
 * refresh. A stamp already there and still fresh means taken (`false`); an
 * expired one is replaced. An unwritable home is `false`: no stamp, no spawn.
 */
export function claimStamp(
	home: string,
	id: RepoId,
	kind: StampKind,
	now: number,
): boolean {
	try {
		const path = stampPath(home, id, kind);
		makePrivateDir(dirname(path));
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const fd = openSync(path, 'wx', 0o600);
				try {
					writeSync(fd, `${JSON.stringify({ writtenAt: now, data: {} })}\n`);
				} finally {
					closeSync(fd);
				}
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false;
				if (stampTaken(path, kind, now)) return false;
				rmSync(path, { force: true });
			}
		}
		return false;
	} catch {
		return false;
	}
}

export function clearStamps(home: string, id: RepoId): void {
	try {
		for (const kind of ['failed', 'refreshing'] as const) {
			rmSync(stampPath(home, id, kind), { force: true });
		}
	} catch {
		// nothing to clear
	}
}
