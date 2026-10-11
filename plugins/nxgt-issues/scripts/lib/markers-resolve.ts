/** Where a marker's upstream repository comes from: a tracking issue naming its package, else the registry (or the written `owner/repo`). */

import type { CliContext } from './cli-context';
import { EXIT } from './cli-context';
import { describeTarget, type Marker } from './markers';
import { MarkerLookupError } from './markers-types';
import { formatRepo } from './repo-id';
import { gate, type RefusalReason, resolvePackage } from './resolve';
import type { Snapshot } from './snapshot';

const HINTS: Record<RefusalReason, string> = {
	'invalid-name': 'not an npm package name; write <package>#n or owner/repo#n',
	'unknown-package': 'neither on the registry nor installed; fix the name',
	'no-repository-field': 'the package declares no GitHub repository',
	'not-owner': 'its repository does not belong to an allowed owner',
	'not-found': 'gh cannot see the repository: renamed, deleted or not visible',
	'issues-disabled': 'issues are off there, nothing will be fixed',
	archived: 'the repository is archived, nothing will be fixed',
	'rate-limited': 'GitHub rate limit',
	unreachable: 'gh failed',
};

export type Resolution = { repo: string } | { problem: string };

/** The upstream repository of a marker: `owner/repo` as written, an npm name through the resolve logic (and its caches). */
async function resolveMarker(
	ctx: CliContext,
	marker: Marker,
): Promise<Resolution> {
	const { target } = marker;
	const result =
		target.kind === 'package'
			? await resolvePackage(ctx, target.name)
			: await gate(ctx, describeTarget(target), target.repo);
	if (!('ok' in result) || result.ok) {
		return { repo: formatRepo(result.repo) };
	}
	const refused = result;
	if (refused.reason === 'rate-limited') {
		throw new MarkerLookupError('GitHub rate limit reached.', EXIT.rateLimited);
	}
	if (refused.reason === 'unreachable') {
		throw new MarkerLookupError(
			'gh failed; run `gh auth status`.',
			EXIT.failed,
		);
	}
	return { problem: `${refused.reason}: ${HINTS[refused.reason]}` };
}

export const same = (a: string, b: string) =>
	a.toLowerCase() === b.toLowerCase();

/**
 * The tracking issue that names this marker's package and number, found before
 * the registry is asked: a package that moved repositories still matches the
 * markers written for its old repository (the registry only knows the new one).
 */
export function trackedByName(
	snapshot: Snapshot,
	marker: Marker,
): { repo: string; upstream: string } | undefined {
	if (marker.target.kind !== 'package') return undefined;
	const name = marker.target.name;
	const matches = snapshot.tracking.filter(
		(t) =>
			t.packageName !== undefined &&
			same(t.packageName, name) &&
			t.upstream.endsWith(`#${marker.number}`),
	);
	// Two entries: the one whose `Tracks` line agrees with its hidden marker.
	const found =
		matches.find(
			(t) => t.tracksUpstream && same(t.tracksUpstream, t.upstream),
		) ?? matches[0];
	return found
		? {
				repo: found.upstream.slice(0, found.upstream.lastIndexOf('#')),
				upstream: found.upstream,
			}
		: undefined;
}

/** The marker's upstream repository through the registry, asked once per target. */
export async function resolveCached(
	ctx: CliContext,
	marker: Marker,
	resolved: Map<string, Resolution>,
): Promise<Resolution> {
	const key = describeTarget(marker.target).toLowerCase();
	let resolution = resolved.get(key);
	if (!resolution) {
		resolution = await resolveMarker(ctx, marker);
		resolved.set(key, resolution);
	}
	return resolution;
}
