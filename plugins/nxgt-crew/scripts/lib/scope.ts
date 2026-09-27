/**
 * Naming repositories and packages so they compare: a remote URL, a package
 * name and a folder all reduce to one key. Pure.
 */

import { basename } from 'node:path';
import type { GitPlace } from './record';

/**
 * A repository or package name in one shape: `@nxgt/mail`, `nxgt-mail` and
 * `softistx/nxgt-mail` all become `nxgt-mail`.
 */
export function scopeKey(scope: string): string {
	const s = scope
		.trim()
		.toLowerCase()
		.replace(/\.git$/, '');
	if (s.startsWith('@')) return s.slice(1).replace('/', '-');
	return s.split('/').pop() ?? s;
}

/** `git@github.com:a/b.git` and `https://github.com/a/b` are the same repository. */
export function normalizeRemote(url: string): string {
	return url
		.trim()
		.replace(/^[a-z+]+:\/\//, '')
		.replace(/^[^@/]+@/, '')
		.replace(':', '/')
		.replace(/\/+$/, '')
		.replace(/\.git$/, '')
		.toLowerCase();
}

/** One clone, or two clones of one remote. */
export function sameRepository(a: GitPlace, b: GitPlace): boolean {
	if (a.repo && b.repo && a.repo === b.repo) return true;
	if (a.remote && b.remote) {
		return normalizeRemote(a.remote) === normalizeRemote(b.remote);
	}
	return false;
}

/**
 * The repository name of a place: the last segment of its normalised remote
 * (`git@github.com:softistx/nxgt-mail.git` → `nxgt-mail`), else its worktree's
 * folder.
 */
export function repoName(
	place: Pick<GitPlace, 'remote' | 'worktree'>,
): string | undefined {
	if (place.remote) {
		const name = normalizeRemote(place.remote).split('/').pop();
		if (name) return name;
	}
	return place.worktree ? scopeKey(basename(place.worktree)) : undefined;
}
