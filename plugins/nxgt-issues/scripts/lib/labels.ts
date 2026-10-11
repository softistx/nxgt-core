/**
 * The labels the plugin files with, and the step that creates the missing ones
 * before a filing: one `gh label list`, then one `gh label create` per label
 * the repository lacks. Names compare case-insensitively, as GitHub's do.
 */

import type { GhContext } from './github';
import { createLabel, type LabelSpec, labelNames } from './github-issues';
import type { RepoId } from './repo-id';

export const LABELS: Readonly<Record<string, LabelSpec>> = {
	bug: { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
	enhancement: {
		name: 'enhancement',
		color: 'a2eeef',
		description: 'New feature or request',
	},
	documentation: {
		name: 'documentation',
		color: '0075ca',
		description: 'Improvements or additions to documentation',
	},
	dependencies: {
		name: 'dependencies',
		color: '0366d6',
		description: 'A dependency is behind its latest release',
	},
	'consumer-report': {
		name: 'consumer-report',
		color: 'fbca04',
		description: 'Filed by nxgt-issues on behalf of a consuming application',
	},
	released: {
		name: 'released',
		color: '0e8a16',
		description: 'The fix is published',
	},
	upstream: {
		name: 'upstream',
		color: 'c5def5',
		description: 'Tracks an issue filed on an in-house package (nxgt-issues)',
	},
};

/** Creates the labels of `wanted` the repository does not have; returns those created. */
export async function ensureLabels(
	ctx: GhContext,
	repo: RepoId,
	wanted: readonly string[],
): Promise<string[]> {
	const present = new Set(
		(await labelNames(ctx, repo)).map((name) => name.toLowerCase()),
	);
	const created: string[] = [];
	for (const name of wanted) {
		if (present.has(name.toLowerCase())) continue;
		const spec = LABELS[name];
		if (!spec) throw new Error(`nxgt-issues: unknown label "${name}"`);
		await createLabel(ctx, repo, spec);
		present.add(name.toLowerCase());
		created.push(name);
	}
	return created;
}
