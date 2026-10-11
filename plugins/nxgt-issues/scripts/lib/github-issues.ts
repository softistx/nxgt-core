/**
 * The issue, label and repository-list calls, each one `gh` invocation through
 * `gh()` (so each honours the rate-limit pause). The fixed words of each
 * command are written as one string and split, to keep them readable.
 */

import { type GhContext, gh, ghJson } from './github';
import { formatRepo, type RepoId } from './repo-id';

export interface IssueSummary {
	readonly number: number;
	readonly title: string;
	readonly state: string;
	readonly url: string;
	readonly body: string;
	readonly labels?: readonly { readonly name: string }[] | undefined;
}

const ISSUE_FIELDS = 'number,title,state,url,body,labels';
const words = (text: string): string[] => text.split(' ');
const repoFlag = (id: RepoId): string[] => ['-R', formatRepo(id)];

/** Issues of a repository carrying a label, any state (no search quota). */
export function issuesWithLabel(
	ctx: GhContext,
	id: RepoId,
	label: string,
): Promise<IssueSummary[]> {
	return ghJson(ctx, [
		...words('issue list --state all --limit 200 --label'),
		label,
		...repoFlag(id),
		...words(`--json ${ISSUE_FIELDS}`),
	]);
}

/** Open issues a free-text search finds: one search-API call. */
export function searchIssues(
	ctx: GhContext,
	id: RepoId,
	query: string,
	limit = 5,
): Promise<IssueSummary[]> {
	return ghJson(ctx, [
		...words('issue list --state open --search'),
		query,
		'--limit',
		String(limit),
		...repoFlag(id),
		...words(`--json ${ISSUE_FIELDS}`),
	]);
}

export interface NewIssue {
	readonly title: string;
	readonly body: string;
	readonly labels: readonly string[];
}

/** Creates an issue, body on stdin; returns its URL. */
export async function createIssue(
	ctx: GhContext,
	id: RepoId,
	issue: NewIssue,
): Promise<string> {
	const labels =
		issue.labels.length > 0 ? ['--label', issue.labels.join(',')] : [];
	const out = await gh(
		ctx,
		[
			...words('issue create --body-file - --title'),
			issue.title,
			...repoFlag(id),
			...labels,
		],
		issue.body,
	);
	return out.trim().split('\n').pop() ?? '';
}

/** Adds a comment, body on stdin; returns its URL. */
export async function commentIssue(
	ctx: GhContext,
	id: RepoId,
	number: number,
	body: string,
): Promise<string> {
	const argv = ['issue', 'comment', String(number), '--body-file', '-'];
	const out = await gh(ctx, [...argv, ...repoFlag(id)], body);
	return out.trim();
}

export async function editIssueBody(
	ctx: GhContext,
	id: RepoId,
	number: number,
	body: string,
): Promise<void> {
	const argv = ['issue', 'edit', String(number), '--body-file', '-'];
	await gh(ctx, [...argv, ...repoFlag(id)], body);
}

export async function reopenIssue(
	ctx: GhContext,
	id: RepoId,
	number: number,
): Promise<void> {
	await gh(ctx, ['issue', 'reopen', String(number), ...repoFlag(id)]);
}

const names = (rows: readonly Record<string, unknown>[], key: string) =>
	rows
		.map((row) => row[key])
		.filter((name): name is string => typeof name === 'string');

/** An owner's private repositories, as `owner/name`. */
export async function privateRepos(
	ctx: GhContext,
	owner: string,
): Promise<string[]> {
	const rows = await ghJson<Record<string, unknown>[]>(ctx, [
		...words('repo list'),
		owner,
		...words('--visibility private --limit 1000 --json nameWithOwner'),
	]);
	return names(rows, 'nameWithOwner');
}

export async function labelNames(
	ctx: GhContext,
	id: RepoId,
): Promise<string[]> {
	const rows = await ghJson<Record<string, unknown>[]>(ctx, [
		...words('label list --limit 200 --json name'),
		...repoFlag(id),
	]);
	return names(rows, 'name');
}

export interface LabelSpec {
	readonly name: string;
	readonly color: string;
	readonly description: string;
}

export async function createLabel(
	ctx: GhContext,
	id: RepoId,
	label: LabelSpec,
): Promise<void> {
	await gh(ctx, [
		...words('label create'),
		label.name,
		'--color',
		label.color,
		'--description',
		label.description,
		...repoFlag(id),
	]);
}
