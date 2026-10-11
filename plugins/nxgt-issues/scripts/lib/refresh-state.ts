/**
 * Two short-lived stamps beside a cache entry, so the hook neither retries a
 * refresh that just failed nor starts a second one while one is running:
 * `failed` (10 minutes: no attempt at all, the hook renders what it has) and
 * `refreshing` (60 seconds: no second detached refresh). Every function
 * swallows its errors; a stamp is an optimisation, never a reason to fail.
 */

import { randomBytes } from 'node:crypto';
import {
	closeSync,
	openSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
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

/**
 * Whether the stamp at `path` still holds, and which generation of it was
 * read: its `writtenAt`, or its modification time when nobody could parse it
 * (being written, or damaged), which then counts as young for the TTL.
 */
function inspect(
	path: string,
	kind: StampKind,
	now: number,
): { fresh: boolean; generation: string } | undefined {
	const entry = readEntry(path, now, TTL_MS[kind]);
	if (entry) return { fresh: entry.fresh, generation: String(entry.writtenAt) };
	try {
		const mtime = statSync(path).mtimeMs;
		return {
			fresh: Math.abs(now - mtime) < TTL_MS[kind],
			generation: `m${Math.floor(mtime)}`,
		};
	} catch {
		return undefined;
	}
}

/** A takeover marker older than this belongs to a claimant that died before it finished. */
const MARKER_ABANDONED_MS = 10_000;

/** Exclusively creates `path`; false when it exists already (or anything else goes wrong). */
function createExclusive(path: string): boolean {
	try {
		closeSync(openSync(path, 'wx', 0o600));
		return true;
	} catch {
		return false;
	}
}

/**
 * Exclusively creates the marker of one generation of a stamp; false when
 * another claimant holds it. A marker older than MARKER_ABANDONED_MS belongs to
 * a claimant that died: every claimant that saw that same stale marker then
 * contends on one more exclusive create, named after the stale marker's
 * modification time and left in place, and only its winner replaces the marker.
 */
function takeGeneration(marker: string): boolean {
	if (createExclusive(marker)) return true;
	try {
		const mtime = statSync(marker).mtimeMs;
		if (Date.now() - mtime < MARKER_ABANDONED_MS) return false;
		if (!createExclusive(`${marker}.${Math.floor(mtime)}`)) return false;
		rmSync(marker, { force: true });
		return createExclusive(marker);
	} catch {
		return false;
	}
}

/** A temporary file older than this was left by a claimant that died before its rename. */
const TEMPORARY_STALE_MS = 10_000;

/**
 * Tidies the stamp folder: drops every takeover marker of `path` except the
 * ones of `keepGeneration` (and its abandoned-marker contests), and the
 * temporaries older than TEMPORARY_STALE_MS.
 */
function sweep(path: string, keepGeneration?: string): void {
	const folder = dirname(path);
	const prefix = `${basename(path)}.takeover.`;
	const keep =
		keepGeneration === undefined ? undefined : `${prefix}${keepGeneration}`;
	for (const name of readdirSync(folder)) {
		const file = join(folder, name);
		const marker =
			name.startsWith(prefix) &&
			!(keep && (name === keep || name.startsWith(`${keep}.`)));
		let stale = false;
		if (name.startsWith(`${basename(path)}.`) && name.endsWith('.tmp')) {
			try {
				stale = Date.now() - statSync(file).mtimeMs > TEMPORARY_STALE_MS;
			} catch {
				// already gone
			}
		}
		if (marker || stale) rmSync(file, { force: true });
	}
}

/**
 * Takes the stamp, exclusively. Of several hooks starting at once exactly one
 * gets `true` and spawns the refresh: a missing stamp is created with the `wx`
 * flag; a fresh one (or a half-written one) means taken; an expired one is
 * replaced by whoever first creates the takeover marker of the generation it
 * read (`<stamp>.takeover.<writtenAt>`, left in place so a late claimant that
 * read the same generation loses too), through a temporary file and a rename;
 * the other generations' markers and stale temporaries are then swept.
 * An unwritable home is `false`: no stamp, no spawn.
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
		const content = `${JSON.stringify({ writtenAt: now, data: {} })}\n`;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const fd = openSync(path, 'wx', 0o600);
				try {
					writeSync(fd, content);
				} finally {
					closeSync(fd);
				}
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return false;
			}
			const seen = inspect(path, kind, now);
			if (!seen) continue; // it vanished between the create and the read: once more
			if (
				seen.fresh ||
				!takeGeneration(`${path}.takeover.${seen.generation}`)
			) {
				return false;
			}
			const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
			writeFileSync(temporary, content, { mode: 0o600 });
			renameSync(temporary, path);
			sweep(path, seen.generation);
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

export function clearStamps(home: string, id: RepoId): void {
	try {
		for (const kind of ['failed', 'refreshing'] as const) {
			const path = stampPath(home, id, kind);
			rmSync(path, { force: true });
			// Its takeover markers and stale temporaries go with it.
			sweep(path);
		}
	} catch {
		// nothing to clear
	}
}
