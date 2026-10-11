/**
 * The reads and the notification search of the release step: an issue's state,
 * labels, body and comments (which are trusted: owner, member, collaborator or
 * the release bot), the `released` label, and the open `upstream` tracking
 * issues whose hidden marker names a released issue.
 */

import { TRUSTED } from './context';
import { search } from './dashboard-data';
import { type GhContext, ghJson } from './github';
import { labelNames } from './github-issues';
import { ensureLabels } from './labels';
import { upstreamRef } from './refs';
import { formatRepo, type RepoId, sameRepo } from './repo-id';

export interface Notify {
	readonly tracking: string;
	readonly title: string;
	readonly url: string;
	readonly upstream: string;
}

const BOT = 'github-actions';
export const FIXED_MARKER = /<!--\s*nxgt-issues:fixed=\S+@\S+\s*-->/;
type Rows = Record<string, unknown>[];
const rows = (value: unknown): Rows =>
	Array.isArray(value) ? (value as Rows) : [];

export interface IssueState {
	readonly body: string;
	readonly open: boolean;
	readonly labelled: boolean;
	readonly comments: { trusted: boolean; body: string }[];
}

export async function readIssue(
	ctx: GhContext,
	repo: string,
	number: number,
): Promise<IssueState> {
	const raw = await ghJson<Record<string, unknown>>(ctx, [
		'issue',
		'view',
		String(number),
		'-R',
		repo,
		'--json',
		'number,state,body,labels,comments',
	]);
	return {
		body: String(raw['body'] ?? ''),
		open: String(raw['state']).toUpperCase() === 'OPEN',
		labelled: rows(raw['labels']).some(
			(label) => String(label['name']).toLowerCase() === 'released',
		),
		comments: rows(raw['comments']).map((comment) => {
			const author = comment['author'] as { login?: string } | null;
			return {
				body: String(comment['body'] ?? ''),
				trusted:
					TRUSTED.has(String(comment['authorAssociation'])) ||
					author?.login === BOT,
			};
		}),
	};
}

/** Whether the `released` label is (or in a dry run would be) created. */
export async function labelCreated(
	ctx: GhContext,
	options: { repo: RepoId; dryRun: boolean },
): Promise<boolean> {
	if (!options.dryRun) {
		return (await ensureLabels(ctx, options.repo, ['released'])).length > 0;
	}
	const present = await labelNames(ctx, options.repo);
	return !present.some((name) => name.toLowerCase() === 'released');
}

export async function notifications(
	ctx: GhContext,
	options: { repo: RepoId; owners: readonly string[] },
	issues: readonly number[],
): Promise<Notify[]> {
	const { found } = await search(
		ctx,
		options.owners,
		['--label', 'upstream', '--state', 'open'],
		'number,title,repository,body',
	);
	return found.flatMap((tracking) => {
		const ref = upstreamRef(tracking.body ?? '');
		if (!ref || !sameRepo(ref.repo, options.repo)) return [];
		if (!issues.includes(ref.number)) return [];
		return [
			{
				tracking: `${tracking.repo}#${tracking.number}`,
				title: tracking.title,
				url: `https://github.com/${tracking.repo}/issues/${tracking.number}`,
				upstream: `${formatRepo(ref.repo)}#${ref.number}`,
			},
		];
	});
}
