/**
 * The `// Temporary, until <package>#<n>` markers an application leaves where it
 * works around an upstream defect. This module only parses: the caller runs
 * `git grep -n -E "Temporary, until "` through the runner and hands the output
 * lines here.
 */

import type { RepoId } from './repo-id';

/** `<npm-name>#n` (default form, scoped or not) or `owner/repo#n`. */
export const MARKER_PATTERN =
	/Temporary, until ((?:@[\w.-]+\/)?[\w.-]+|[\w.-]+\/[\w.-]+)#(\d+)/;

/** The command whose output `parseMarkers` reads. */
export const MARKER_GREP_ARGV = [
	'git',
	'grep',
	'-n',
	'-E',
	'Temporary, until ',
] as const;

export type MarkerTarget =
	| { readonly kind: 'package'; readonly name: string }
	| { readonly kind: 'repo'; readonly repo: RepoId };

export interface Marker {
	readonly file: string;
	readonly line: number;
	readonly target: MarkerTarget;
	readonly number: number;
	/** The marked line, trimmed. */
	readonly text: string;
}

export function parseTarget(text: string): MarkerTarget {
	if (!text.startsWith('@') && text.includes('/')) {
		const [owner = '', repo = ''] = text.split('/');
		return { kind: 'repo', repo: { owner, repo } };
	}
	return { kind: 'package', name: text };
}

/** One `path:line:content` line of `git grep -n`; undefined when it holds no marker. */
export function parseMarkerLine(line: string): Marker | undefined {
	const located = /^(.+?):(\d+):(.*)$/.exec(line.replace(/\r$/, ''));
	if (!located?.[1] || !located[2] || located[3] === undefined)
		return undefined;
	const match = MARKER_PATTERN.exec(located[3]);
	if (!match?.[1] || !match[2]) return undefined;
	return {
		file: located[1],
		line: Number(located[2]),
		target: parseTarget(match[1]),
		number: Number(match[2]),
		text: located[3].trim(),
	};
}

export function parseMarkers(output: string): Marker[] {
	const markers: Marker[] = [];
	for (const line of output.split('\n')) {
		const marker = parseMarkerLine(line);
		if (marker) markers.push(marker);
	}
	return markers;
}

export function describeTarget(target: MarkerTarget): string {
	return target.kind === 'package'
		? target.name
		: `${target.repo.owner}/${target.repo.repo}`;
}

/** Markers grouped by what they wait for: `<target>#<n>` → its markers. */
export function groupByUpstream(
	markers: readonly Marker[],
): Map<string, Marker[]> {
	const groups = new Map<string, Marker[]>();
	for (const marker of markers) {
		const key = `${describeTarget(marker.target)}#${marker.number}`;
		groups.set(key, [...(groups.get(key) ?? []), marker]);
	}
	return groups;
}
