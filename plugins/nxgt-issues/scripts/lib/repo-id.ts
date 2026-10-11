/**
 * Which GitHub repository something belongs to — a `git remote` URL, a
 * `package.json` `repository` field, or a directory — and whether its owner is
 * one the plugin may touch. Nothing here spawns: the `origin` URL of a checkout
 * is read straight from `.git/config`, following a linked worktree's `.git`
 * file to the `commondir` that holds the shared config.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export interface RepoId {
	readonly owner: string;
	readonly repo: string;
}

export const DEFAULT_OWNERS = ['softistx', 'SteveGT96'] as const;

const NAME = '[\\w.-]+';
const HOST = '(?:www\\.)?github\\.com';

const cleanRepo = (repo: string): string => repo.replace(/\.git$/i, '');

const make = (owner: string | undefined, repo: string | undefined) =>
	owner && repo && cleanRepo(repo)
		? { owner, repo: cleanRepo(repo) }
		: undefined;

/** `https://github.com/o/r(.git)`, `git@github.com:o/r.git`, `ssh://git@github.com/o/r`, `git+https://…`, `git://…`. */
export function parseRemote(url: string): RepoId | undefined {
	const text = url.trim();
	const scp = new RegExp(
		`^(?:[\\w.-]+@)?${HOST}:(${NAME})/(${NAME})/?$`,
		'i',
	).exec(text);
	if (scp) return make(scp[1], scp[2]);
	const standard = new RegExp(
		`^(?:git\\+)?(?:https?|ssh|git)://(?:[^@/\\s]+@)?${HOST}(?::\\d+)?/(${NAME})/(${NAME})/?$`,
		'i',
	).exec(text);
	return standard ? make(standard[1], standard[2]) : undefined;
}

/**
 * A `package.json` `repository`: a string or `{ url }`, as a remote URL, as
 * `github:o/r`, or as the bare `o/r` shorthand.
 */
export function parseRepositoryField(field: unknown): RepoId | undefined {
	const value =
		typeof field === 'string'
			? field
			: field && typeof field === 'object' && 'url' in field
				? (field as { url: unknown }).url
				: undefined;
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	const shorthand = new RegExp(`^(?:github:)?(${NAME})/(${NAME})$`, 'i').exec(
		text,
	);
	if (shorthand) return make(shorthand[1], shorthand[2]);
	return parseRemote(text);
}

export function allowedOwners(
	env: Record<string, string | undefined>,
): string[] {
	const raw = env['NXGT_ISSUES_OWNERS'];
	const listed = (raw ?? '')
		.split(',')
		.map((owner) => owner.trim())
		.filter(Boolean);
	return listed.length > 0 ? listed : [...DEFAULT_OWNERS];
}

/** GitHub logins compare case-insensitively. */
export function isAllowedOwner(
	owner: string,
	owners: readonly string[],
): boolean {
	const wanted = owner.toLowerCase();
	return owners.some((candidate) => candidate.toLowerCase() === wanted);
}

export function sameRepo(a: RepoId, b: RepoId): boolean {
	return (
		a.owner.toLowerCase() === b.owner.toLowerCase() &&
		a.repo.toLowerCase() === b.repo.toLowerCase()
	);
}

export const formatRepo = (id: RepoId): string => `${id.owner}/${id.repo}`;

/** The `url` of `[remote "origin"]` in a git config, or undefined. */
export function originUrlFromConfig(config: string): string | undefined {
	let inOrigin = false;
	for (const raw of config.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('[')) {
			inOrigin = /^\[remote\s+"origin"\s*\]$/.test(line);
			continue;
		}
		if (!inOrigin) continue;
		const match = /^url\s*=\s*(.+)$/.exec(line);
		if (match?.[1]) return match[1].trim();
	}
	return undefined;
}

function findDotGit(start: string): string | undefined {
	let dir = resolve(start);
	for (;;) {
		const candidate = join(dir, '.git');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/** The directory whose `config` holds the remotes of the checkout at `start`. */
export function gitConfigPath(start: string): string | undefined {
	const dotGit = findDotGit(start);
	if (!dotGit) return undefined;
	let gitDir = dotGit;
	if (statSync(dotGit).isFile()) {
		const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
		if (!match?.[1]) return undefined;
		const target = match[1].trim();
		gitDir = isAbsolute(target) ? target : resolve(dirname(dotGit), target);
	}
	const commondir = join(gitDir, 'commondir');
	if (existsSync(commondir)) {
		const target = readFileSync(commondir, 'utf8').trim();
		if (target) gitDir = isAbsolute(target) ? target : resolve(gitDir, target);
	}
	const config = join(gitDir, 'config');
	return existsSync(config) ? config : undefined;
}

/** The repository `origin` points at, for a checkout or a linked worktree; never throws. */
export function repoOfDirectory(start: string): RepoId | undefined {
	try {
		const config = gitConfigPath(start);
		if (!config) return undefined;
		const url = originUrlFromConfig(readFileSync(config, 'utf8'));
		return url ? parseRemote(url) : undefined;
	} catch {
		return undefined;
	}
}
