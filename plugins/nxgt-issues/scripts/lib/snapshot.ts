/** What a refresh caches for one repository, and what each tracking issue knows of its upstream issue. */

export interface PackageIssue {
	readonly number: number;
	readonly title: string;
	readonly labels: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface TrackingIssue {
	readonly number: number;
	readonly title: string;
	/** `owner/repo#n` of the upstream issue the hidden marker names. */
	readonly upstream: string;
	/** The package the body's `Tracks o/r#n (\`pkg\`).` line names; a marker for it matches here even after the package moved repositories. */
	readonly packageName?: string;
	readonly upstreamState?: 'OPEN' | 'CLOSED';
	readonly upstreamLabels?: readonly string[];
	/** GitHub could not read the upstream issue (any error but NOT_FOUND): neither ready nor known to be missing. */
	readonly upstreamUnknown?: true;
	readonly lastComment?: string;
	/** The comment author's `authorAssociation` (OWNER, MEMBER, NONE…). */
	readonly lastCommentBy?: string;
	/** The comment author's login and GraphQL type (`Bot` for the release bot, whose login is `github-actions`). */
	readonly lastCommentLogin?: string;
	readonly lastCommentAuthorType?: string;
}

/** What one upstream issue says now. */
export interface UpstreamIssue {
	readonly state?: 'OPEN' | 'CLOSED';
	/** Lower-cased, as GitHub compares label names. */
	readonly labels: readonly string[];
	readonly lastComment?: string;
	readonly lastCommentBy?: string;
	readonly lastCommentLogin?: string;
	readonly lastCommentAuthorType?: string;
	/** GitHub could not read this issue (any error but NOT_FOUND). */
	readonly unknown?: true;
}

export interface Snapshot {
	readonly repo: string;
	readonly issues: readonly PackageIssue[];
	readonly tracking: readonly TrackingIssue[];
	/** Open issues of the repository, tracking issues apart (the list is capped). */
	readonly total?: number;
}

/** A snapshot with an unreadable upstream issue is fresh for this long only, so the next look retries it. */
export const PARTIAL_TTL_MS = 2 * 60 * 1000;

/** Whether a cache entry holding a snapshot is fresh: the entry's own TTL, and the short one when an upstream issue is unreadable. */
export const snapshotFresh = (entry: {
	readonly fresh: boolean;
	readonly ageMs: number;
	readonly data: Snapshot;
}): boolean =>
	entry.fresh &&
	(entry.ageMs < PARTIAL_TTL_MS ||
		!entry.data.tracking.some((issue) => issue.upstreamUnknown));
