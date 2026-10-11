/**
 * Fixtures for the SessionStart specs: a checkout of an invented repository,
 * a cache home, and the two GraphQL answers `refresh.ts` expects.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachePath } from './cache';
import type { Snapshot } from './refresh';
import type { RepoId } from './repo-id';
import { tempDir } from './temp.fixtures';

export { removeTempDirs } from './temp.fixtures';

export const ME: RepoId = { owner: 'softistx', repo: 'nxgt-zorblax' };

export function checkout(origin: string): string {
	const dir = join(tempDir('session'), 'work');
	mkdirSync(join(dir, '.git'), { recursive: true });
	writeFileSync(
		join(dir, '.git', 'config'),
		`[remote "origin"]\n\turl = ${origin}\n`,
	);
	return dir;
}

export const home = (): string => tempDir('home');

export function seed(homeDir: string, snapshot: Snapshot, writtenAt: number) {
	const path = cachePath(homeDir, ME);
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, JSON.stringify({ writtenAt, data: snapshot }));
}

export const NOW = Date.parse('2026-10-11T12:00:00Z');
export const ago = (ms: number): string => new Date(NOW - ms).toISOString();
export const DAY = 24 * 60 * 60 * 1000;

export const SNAPSHOT: Snapshot = {
	repo: 'softistx/nxgt-zorblax',
	issues: [
		{
			number: 3,
			title: 'parse() drops the last item',
			labels: ['bug', 'consumer-report'],
			createdAt: ago(5 * DAY),
			updatedAt: ago(DAY),
		},
	],
	tracking: [],
};

/** The answer to the listing query. */
export const listing = (over: { issues?: unknown[]; tracking?: unknown[] }) =>
	JSON.stringify({
		data: {
			repository: {
				issues: { nodes: over.issues ?? [] },
				tracking: { nodes: over.tracking ?? [] },
			},
		},
	});

export const GRAPHQL = ['gh', 'api', 'graphql'] as const;
