/**
 * The on-disk cache: `<home>/cache/<owner>__<repo>.json`, each entry stamped
 * with when it was written, fresh for ten minutes. Written through a temporary
 * file and a rename so a reader never sees half an entry; a file that does not
 * parse is a miss, never an error. The folders are 0700 and the files 0600
 * (the temporary file included): issue titles of private repositories are
 * nobody else's business on a shared machine.
 */

import { randomBytes } from 'node:crypto';
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type RepoId, SAFE_REPO } from './repo-id';

export const CACHE_TTL_MS = 10 * 60 * 1000;

export function issuesHome(env: Record<string, string | undefined>): string {
	if (env['NXGT_ISSUES_HOME']) return env['NXGT_ISSUES_HOME'];
	const config = env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude');
	return join(config, 'nxgt-issues');
}

/** `<home>/cache/<owner>__<repo>.json`; throws on a name that could leave the folder. */
export function cachePath(home: string, id: RepoId): string {
	for (const part of [id.owner, id.repo]) {
		if (part === '.' || part === '..') {
			throw new Error(`nxgt-issues: refusing the cache name "${part}"`);
		}
	}
	if (!SAFE_REPO.test(`${id.owner}/${id.repo}`)) {
		throw new Error(
			`nxgt-issues: refusing the cache name "${id.owner}/${id.repo}"`,
		);
	}
	return join(home, 'cache', `${id.owner}__${id.repo}.json`.toLowerCase());
}

export interface CacheEntry<T> {
	readonly data: T;
	readonly writtenAt: number;
	readonly ageMs: number;
	readonly fresh: boolean;
}

export function readEntry<T>(
	path: string,
	now: number,
	ttlMs: number = CACHE_TTL_MS,
): CacheEntry<T> | undefined {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			typeof (parsed as { writtenAt?: unknown }).writtenAt !== 'number' ||
			!('data' in parsed)
		) {
			return undefined;
		}
		const { writtenAt, data } = parsed as { writtenAt: number; data: T };
		const age = now - writtenAt;
		// A writtenAt in the future (clock moved back) cannot be trusted: stale.
		return {
			data,
			writtenAt,
			ageMs: Math.max(0, age),
			fresh: age >= 0 && age < ttlMs,
		};
	} catch {
		return undefined;
	}
}

/** The folder and any missing parent, 0700; a folder that already exists is tightened to 0700 too. */
export function makePrivateDir(dir: string): void {
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(dir, 0o700);
	} catch {
		// not ours to change: the write below decides whether it works
	}
}

export function writeEntry(path: string, data: unknown, now: number): void {
	makePrivateDir(dirname(path));
	const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
	try {
		writeFileSync(temporary, `${JSON.stringify({ writtenAt: now, data })}\n`, {
			mode: 0o600,
		});
		renameSync(temporary, path);
	} catch (error) {
		rmSync(temporary, { force: true });
		throw error;
	}
}

/** "as of 4m ago" for the age of a stale entry. */
export function describeAge(ageMs: number): string {
	const minutes = Math.floor(ageMs / 60_000);
	if (minutes < 1) return 'as of under a minute ago';
	if (minutes < 60) return `as of ${minutes}m ago`;
	return `as of ${Math.floor(minutes / 60)}h ago`;
}
