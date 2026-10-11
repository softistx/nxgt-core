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
	readonly upstreamState?: 'OPEN' | 'CLOSED';
	readonly upstreamLabels?: readonly string[];
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
}

export interface Snapshot {
	readonly repo: string;
	readonly issues: readonly PackageIssue[];
	readonly tracking: readonly TrackingIssue[];
	/** Open issues of the repository, tracking issues apart (the list is capped). */
	readonly total?: number;
}
