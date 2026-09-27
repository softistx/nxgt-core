/**
 * Reads the roadmap files of a worktree from disk: `docs/roadmap.md` at its
 * root, and `packages/*\/docs/roadmap.md` below it — the layout the nxgt-docs
 * roadmap-keeper writes. Parsing lives in `roadmap.ts`; this is the I/O.
 * Read-only; a file that cannot be read is skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { repoName } from './alignment';
import { parseRoadmap, type Roadmap } from './roadmap';

const PATTERNS = ['docs/roadmap.md', 'packages/*/docs/roadmap.md'];

/** `remote.origin.url` of a worktree, or `undefined`. */
export function originOf(worktree: string): string | undefined {
	const out = Bun.spawnSync(
		['git', '-C', worktree, 'config', '--get', 'remote.origin.url'],
		{ stdout: 'pipe', stderr: 'ignore' },
	);
	const url = out.exitCode === 0 ? out.stdout.toString().trim() : '';
	return url || undefined;
}

/**
 * The scope of the repository-level roadmap: the repository's name from its
 * remote (`git@github.com:softistx/nxgt-mail.git` → `nxgt-mail`), and only
 * without a remote the folder's name — a worktree folder is often called `wt`.
 */
export function repoScope(worktree: string, remote?: string): string {
	const url = remote ?? originOf(worktree);
	return (url && repoName({ remote: url })) || basename(worktree);
}

/** A package roadmap's scope: its manifest's `name`, else its folder's name. */
function packageScope(pkgDir: string): string {
	try {
		const manifest = JSON.parse(
			readFileSync(join(pkgDir, 'package.json'), 'utf8'),
		);
		if (typeof manifest.name === 'string' && manifest.name) {
			return manifest.name;
		}
	} catch {
		// No manifest: fall back to the folder name.
	}
	return basename(pkgDir);
}

/**
 * Every roadmap in `worktree`. `remote` names the repository when the caller
 * already knows it; otherwise the worktree's own `origin` is read.
 */
export function readRoadmaps(worktree: string, remote?: string): Roadmap[] {
	if (!existsSync(worktree)) return [];
	const out: Roadmap[] = [];
	let root: string | undefined;
	const rootScope = () => {
		root = root ?? repoScope(worktree, remote);
		return root;
	};
	for (const pattern of PATTERNS) {
		const files = new Bun.Glob(pattern).scanSync({
			cwd: worktree,
			onlyFiles: true,
		});
		for (const rel of files) {
			const path = join(worktree, rel);
			const pkgDir = dirname(dirname(path));
			try {
				const entries = parseRoadmap(readFileSync(path, 'utf8'));
				const scope = pkgDir === worktree ? rootScope() : packageScope(pkgDir);
				out.push({ path, scope, entries });
			} catch {
				// Unreadable: skip.
			}
		}
	}
	return out;
}
