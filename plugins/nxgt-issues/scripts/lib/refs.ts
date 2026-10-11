/**
 * References between issues: the closing keywords of a pull request body, the
 * `owner/repo#n` form, and the hidden marker that links a private tracking
 * issue to its upstream issue.
 */

import { formatRepo, type RepoId } from './repo-id';

export interface IssueRef {
	/** Absent for a bare `#n`, meaning the repository the text lives in. */
	readonly repo?: RepoId;
	readonly number: number;
}

const KEYWORD = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';
const TARGET = '(?:([\\w.-]+)/([\\w.-]+))?#(\\d+)';
const ISSUE_URL =
	'https://(?:www\\.)?github\\.com/([\\w.-]+)/([\\w.-]+)/issues/(\\d+)';

/**
 * Issues a body closes, by GitHub's keywords (`close`, `fix`, `resolve` and
 * their forms, optionally followed by a colon), as `#n`, `owner/repo#n` or a github.com issue URL.
 * Case-insensitive; each reference once, in order of appearance.
 */
export function closingRefs(text: string): IssueRef[] {
	const pattern = new RegExp(
		`(?<![\\w-])${KEYWORD}:?\\s+(?:${TARGET}(?![\\w])|${ISSUE_URL}(?![\\w]))`,
		'gi',
	);
	const seen = new Set<string>();
	const refs: IssueRef[] = [];
	for (const match of text.matchAll(pattern)) {
		const owner = match[1] ?? match[4];
		const repo = match[2] ?? match[5];
		const number = Number(match[3] ?? match[6]);
		const key = `${owner?.toLowerCase() ?? ''}/${repo?.toLowerCase() ?? ''}#${number}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push(owner && repo ? { repo: { owner, repo }, number } : { number });
	}
	return refs;
}

/** `owner/repo#n` (or `#n`) as a single reference. */
export function parseIssueRef(text: string): IssueRef | undefined {
	const match = new RegExp(`^${TARGET}$`).exec(text.trim());
	if (!match?.[3]) return undefined;
	const number = Number(match[3]);
	return match[1] && match[2]
		? { repo: { owner: match[1], repo: match[2] }, number }
		: { number };
}

export function formatIssueRef(ref: IssueRef): string {
	return `${ref.repo ? formatRepo(ref.repo) : ''}#${ref.number}`;
}

const UPSTREAM = /<!--\s*nxgt-issues:upstream=([\w.-]+)\/([\w.-]+)#(\d+)\s*-->/;

/** The hidden marker a tracking issue carries to name its upstream issue. */
export function upstreamMarker(ref: { repo: RepoId; number: number }): string {
	return `<!-- nxgt-issues:upstream=${formatRepo(ref.repo)}#${ref.number} -->`;
}

/** The upstream issue a tracking-issue body names, if any (the first marker). */
export function upstreamRef(
	body: string,
): { repo: RepoId; number: number } | undefined {
	const match = UPSTREAM.exec(body);
	if (!match?.[1] || !match[2] || !match[3]) return undefined;
	return {
		repo: { owner: match[1], repo: match[2] },
		number: Number(match[3]),
	};
}
