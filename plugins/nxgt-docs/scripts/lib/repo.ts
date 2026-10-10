/**
 * The repository side of the Stop hook: the root, the files changed on the
 * branch and in the working tree, and a `PackageLookup` over the working copy.
 * A handful of local git calls, no network.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PackageInfo, PackageLookup } from './gaps';
import { ignoredManifestDir, packageJsonSurfaceChanged } from './surface';

/**
 * The argv of a git call. `--no-optional-locks` keeps `git status` from
 * taking `index.lock`, so the hook never races the session's own git commands.
 */
export function gitArgv(cwd: string, args: readonly string[]): string[] {
	return ['git', '--no-optional-locks', '-C', cwd, ...args];
}

/** Runs git; `undefined` when it fails. */
function git(cwd: string, args: string[]): string | undefined {
	const proc = Bun.spawnSync(gitArgv(cwd, args), {
		stdout: 'pipe',
		stderr: 'ignore',
	});
	return proc.exitCode === 0 ? proc.stdout.toString() : undefined;
}

export function repositoryRoot(cwd: string): string | undefined {
	return git(cwd, ['rev-parse', '--show-toplevel'])?.trim() || undefined;
}

/** The integration base: origin/develop, else origin/main, else origin/HEAD. */
const BASE_REFS = [
	'refs/remotes/origin/develop',
	'refs/remotes/origin/main',
	'refs/remotes/origin/HEAD',
];

/** The merge-base of HEAD with the integration base, when there is one. */
export function mergeBase(root: string): string | undefined {
	const refs = (
		git(root, ['for-each-ref', '--format=%(refname)', ...BASE_REFS]) ?? ''
	)
		.split('\n')
		.filter(Boolean);
	const ref = BASE_REFS.find((r) => refs.includes(r));
	if (!ref) return undefined;
	return git(root, ['merge-base', 'HEAD', ref])?.trim() || undefined;
}

/**
 * Paths from `git status --porcelain -z`, untracked included, both sides of a
 * rename or copy — staged (`R `) or not (` R`, an intent-to-add rename).
 */
export function parseStatus(output: string): string[] {
	const fields = output.split('\0');
	const paths: string[] = [];
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i] ?? '';
		if (field.length < 4) continue;
		paths.push(field.slice(3));
		const [x, y] = [field[0], field[1]];
		if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
			const from = fields[++i];
			if (from) paths.push(from);
		}
	}
	return paths;
}

/**
 * Uncommitted files ∪ files changed since the merge-base, repository-relative.
 * `--no-renames` lists both sides of a committed rename, so a file moved out
 * of src/ still shows its old path.
 */
export function changedFiles(root: string, base: string | undefined): string[] {
	const files = new Set(
		parseStatus(
			git(root, ['status', '--porcelain', '-z', '--untracked-files=all']) ?? '',
		),
	);
	if (base) {
		for (const file of (
			git(root, ['diff', '--no-renames', '--name-only', '-z', base]) ?? ''
		).split('\0')) {
			if (file) files.add(file);
		}
	}
	return [...files];
}

function readJson(path: string): Record<string, unknown> | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
		return value && typeof value === 'object'
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Packages over the working copy: the nearest directory with a `package.json`
 * owns a file, and only a manifest not `"private": true` is published. A
 * manifest that is test data (`ignoredManifestDir`) owns nothing.
 * `base` is the commit `package.json` is compared with (the merge-base, else HEAD).
 */
export function createLookup(root: string, base: string): PackageLookup {
	const byDir = new Map<
		string,
		{ info: PackageInfo; published: boolean } | undefined
	>();
	const manifests = new Map<string, Record<string, unknown>>();

	function at(dir: string) {
		if (byDir.has(dir)) return byDir.get(dir);
		const manifest = readJson(join(root, dir, 'package.json'));
		const found = manifest
			? {
					info: {
						dir,
						name:
							typeof manifest['name'] === 'string'
								? manifest['name']
								: dir || '(root)',
						hasDocs: existsSync(join(root, dir, 'docs')),
					},
					published: manifest['private'] !== true,
				}
			: undefined;
		if (manifest) manifests.set(dir, manifest);
		byDir.set(dir, found);
		return found;
	}

	return {
		packageOf(file) {
			let dir = dirname(file);
			for (;;) {
				const key = dir === '.' ? '' : dir;
				const found = ignoredManifestDir(
					key,
					(d) =>
						at(d) !== undefined &&
						manifests.get(d)?.['workspaces'] === undefined,
				)
					? undefined
					: at(key);
				if (found) return found;
				if (key === '') return undefined;
				dir = dirname(dir);
			}
		},
		manifestSurfaceChanged(info) {
			const current = manifests.get(info.dir);
			if (!current) return false;
			const path =
				info.dir === '' ? 'package.json' : `${info.dir}/package.json`;
			const shown = git(root, ['show', `${base}:${path}`]);
			let previous: Record<string, unknown> | undefined;
			try {
				previous = shown === undefined ? undefined : JSON.parse(shown);
			} catch {
				previous = undefined;
			}
			return packageJsonSurfaceChanged(previous, current);
		},
	};
}
