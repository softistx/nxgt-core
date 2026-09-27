/**
 * Reads the roadmaps of a worktree: `docs/roadmap.md` at its root, and
 * `packages/*\/docs/roadmap.md` below it — the layout the nxgt-docs
 * roadmap-keeper writes. Read-only; a file that cannot be read is skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseRoadmap, type Roadmap } from './alignment';

const PATTERNS = ['docs/roadmap.md', 'packages/*/docs/roadmap.md'];

function scopeOf(worktree: string, file: string): string {
	const pkgDir = dirname(dirname(file));
	try {
		const manifest = JSON.parse(
			readFileSync(join(pkgDir, 'package.json'), 'utf8'),
		);
		if (pkgDir !== worktree && typeof manifest.name === 'string') {
			return manifest.name;
		}
	} catch {
		// No manifest: fall back to the folder name.
	}
	return basename(pkgDir);
}

export function readRoadmaps(worktree: string): Roadmap[] {
	if (!existsSync(worktree)) return [];
	const out: Roadmap[] = [];
	for (const pattern of PATTERNS) {
		for (const rel of new Bun.Glob(pattern).scanSync({
			cwd: worktree,
			onlyFiles: true,
		})) {
			const path = join(worktree, rel);
			try {
				const entries = parseRoadmap(readFileSync(path, 'utf8'));
				out.push({ path, scope: scopeOf(worktree, path), entries });
			} catch {
				// Unreadable: skip.
			}
		}
	}
	return out;
}
