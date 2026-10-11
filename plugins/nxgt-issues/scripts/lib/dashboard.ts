/**
 * The `/issues` dashboard, pure: ranking and rendering of what the searches
 * found. Issues are grouped by repository (headed by the packages it
 * publishes); inside a group, an issue some application's tracking issue still
 * waits on comes first, then the one that affects most applications, then the
 * oldest. Titles, repository names and labels are other people's text: they go
 * through `context.ts`'s `oneLine` and sit under its untrusted-data header.
 */

import { days, INACTIVE_DAYS, oneLine, UNTRUSTED } from './context';

export interface DashIssue {
	/** `owner/repo` */
	readonly repo: string;
	readonly number: number;
	readonly title: string;
	readonly labels: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly closedAt?: string;
}

export interface DashInput {
	readonly issues: readonly DashIssue[];
	/** `owner/repo#n` of every issue an open tracking issue links (one entry per tracking issue). */
	readonly trackedUpstream: readonly string[];
	/** "Another consumer hit this" comments per `owner/repo#n`. */
	readonly duplicates: ReadonlyMap<string, number>;
	/** The package names each repository publishes. */
	readonly packages: ReadonlyMap<string, readonly string[]>;
	readonly awaiting: readonly DashIssue[];
	readonly now: number;
}

export interface RankedIssue extends DashIssue {
	/** An application's tracking issue still waits on it. */
	readonly live: boolean;
	/** Applications known to be hit: tracking links, or the reporter plus its duplicate comments. */
	readonly affected: number;
	/** No activity for `INACTIVE_DAYS` days or more. */
	readonly inactive: boolean;
	readonly ageDays: number;
}

export interface Group {
	readonly repo: string;
	readonly packages: readonly string[];
	readonly issues: readonly RankedIssue[];
}

export interface Dashboard {
	readonly groups: readonly Group[];
	readonly awaiting: readonly DashIssue[];
}

export const issueKey = (issue: Pick<DashIssue, 'repo' | 'number'>): string =>
	`${issue.repo}#${issue.number}`.toLowerCase();

const REPORT = 'consumer-report';

function rank(issue: DashIssue, input: DashInput, links: number): RankedIssue {
	const key = issueKey(issue);
	const reporter = issue.labels.includes(REPORT)
		? 1 + (input.duplicates.get(key) ?? 0)
		: 0;
	return {
		...issue,
		live: links > 0,
		affected: Math.max(links, reporter),
		inactive: days(issue.updatedAt, input.now) >= INACTIVE_DAYS,
		ageDays: days(issue.createdAt, input.now),
	};
}

const byRank = (a: RankedIssue, b: RankedIssue): number =>
	Number(b.live) - Number(a.live) ||
	b.affected - a.affected ||
	Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
	a.number - b.number;

/** Groups ordered by their best issue; tracking issues are not listed (they are the applications' side). */
export function rankDashboard(input: DashInput): Dashboard {
	const links = new Map<string, number>();
	for (const key of input.trackedUpstream) {
		const lower = key.toLowerCase();
		links.set(lower, (links.get(lower) ?? 0) + 1);
	}
	const byRepo = new Map<string, RankedIssue[]>();
	for (const issue of input.issues) {
		if (issue.labels.includes('upstream')) continue;
		const list = byRepo.get(issue.repo) ?? [];
		list.push(rank(issue, input, links.get(issueKey(issue)) ?? 0));
		byRepo.set(issue.repo, list);
	}
	const groups = [...byRepo.entries()].map(([repo, list]) => ({
		repo,
		packages: input.packages.get(repo) ?? [],
		issues: list.sort(byRank),
	}));
	groups.sort(
		(a, b) =>
			byRank(a.issues[0] as RankedIssue, b.issues[0] as RankedIssue) ||
			a.repo.localeCompare(b.repo),
	);
	const awaiting = [...input.awaiting].sort(
		(a, b) =>
			Date.parse(a.closedAt ?? a.updatedAt) -
				Date.parse(b.closedAt ?? b.updatedAt) || a.number - b.number,
	);
	return { groups, awaiting };
}

function issueLine(issue: RankedIssue): string {
	const marks = [issue.live ? '●' : '', issue.inactive ? '⚑' : '']
		.filter(Boolean)
		.join(' ');
	const tags = issue.labels.map((label) => oneLine(label, 24)).join(', ');
	return `- #${issue.number}${marks ? ` ${marks}` : ''}${tags ? ` [${tags}]` : ''} ${oneLine(issue.title, 80)} (${issue.affected} affected, ${issue.ageDays}d old)`;
}

/** The dashboard as text, under the untrusted-data header. */
export function renderDashboard(board: Dashboard, now: number): string[] {
	const total = board.groups.reduce((n, g) => n + g.issues.length, 0);
	const lines = [
		`nxgt-issues: ${UNTRUSTED}`,
		`nxgt-issues dashboard: ${total} open issue(s) in ${board.groups.length} repositor${board.groups.length === 1 ? 'y' : 'ies'}; ● = an application's tracking issue still waits on it, ⚑ = no activity for ${INACTIVE_DAYS}+ days.`,
	];
	for (const group of board.groups) {
		const names = group.packages.map((name) => oneLine(name, 60)).join(', ');
		lines.push(
			'',
			names ? `${names} (${oneLine(group.repo, 80)})` : oneLine(group.repo, 80),
			...group.issues.map(issueLine),
		);
	}
	if (board.awaiting.length > 0) {
		lines.push('', 'Merged, awaiting release:');
		for (const issue of board.awaiting) {
			const since = days(issue.closedAt ?? issue.updatedAt, now);
			lines.push(
				`- ${oneLine(issue.repo, 80)}#${issue.number} ${oneLine(issue.title, 80)} (closed ${since}d ago)`,
			);
		}
	}
	if (total === 0 && board.awaiting.length === 0) {
		lines.push('', 'no open issue and no fix awaiting release.');
	}
	return lines;
}
