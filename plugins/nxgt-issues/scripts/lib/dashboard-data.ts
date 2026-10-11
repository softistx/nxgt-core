/**
 * What the dashboard reads: three `gh search issues` calls (open issues of the
 * allowed owners, their open `upstream` tracking issues, and the closed
 * `consumer-report` issues not yet `released`) and one aliased GraphQL call
 * counting the "Another consumer hit this" comments of the open reports. The
 * search API allows 30 calls a minute; a run makes three.
 */

import { TRUSTED } from './context';
import type { DashIssue } from './dashboard';
import { type GhContext, gh } from './github';
import { graphql } from './refresh';
import { upstreamRef } from './refs';
import { formatRepo, isAllowedOwner } from './repo-id';

const FIELDS = 'number,title,labels,createdAt,updatedAt,closedAt,repository';
export const MAX_REPORTS = 30;
/** Results asked of one search; a search that returns this many may have more. */
export const SEARCH_LIMIT = 200;
const DUPLICATE = /^Another consumer hit this/;

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};
const text = (value: unknown): string =>
	typeof value === 'string' ? value : '';

export interface Found extends DashIssue {
	/** Only on a search that asked for it. */
	readonly body?: string;
}

export interface Searched {
	readonly found: Found[];
	/** The search returned its whole limit: more may exist. */
	readonly full: boolean;
}

/** One search call; entries of a foreign owner or an archived repository are dropped. */
export async function search(
	ctx: GhContext,
	owners: readonly string[],
	flags: readonly string[],
	fields: string = FIELDS,
	rest: readonly string[] = [],
): Promise<Searched> {
	const out = await gh(ctx, [
		'search',
		'issues',
		...owners.flatMap((owner) => ['--owner', owner]),
		...flags,
		'--archived=false',
		'--limit',
		String(SEARCH_LIMIT),
		'--json',
		fields,
		...rest,
	]);
	let parsed: unknown;
	try {
		parsed = JSON.parse(out);
	} catch {
		throw new Error(`unparseable JSON from gh search: ${out.slice(0, 100)}`);
	}
	if (!Array.isArray(parsed)) return { found: [], full: false };
	const found = parsed.flatMap((raw): Found[] => {
		const item = obj(raw);
		const repository = obj(item['repository']);
		const repo = text(repository['nameWithOwner']);
		const owner = repo.split('/')[0] ?? '';
		const number = Number(item['number']);
		if (!(repo && Number.isInteger(number)) || !isAllowedOwner(owner, owners)) {
			return [];
		}
		const labels = Array.isArray(item['labels']) ? item['labels'] : [];
		const closedAt = text(item['closedAt']);
		return [
			{
				repo,
				number,
				title: text(item['title']),
				labels: labels.map((label) => text(obj(label)['name'])).filter(Boolean),
				createdAt: text(item['createdAt']),
				updatedAt: text(item['updatedAt']),
				...(closedAt && !closedAt.startsWith('0001') ? { closedAt } : {}),
				...(item['body'] === undefined ? {} : { body: text(item['body']) }),
			},
		];
	});
	return { found, full: parsed.length >= SEARCH_LIMIT };
}

/** The `owner/repo#n` each open tracking issue links, one entry per tracking issue. */
export function trackedUpstream(
	tracking: readonly Found[],
	owners: readonly string[],
): string[] {
	return tracking.flatMap((issue) => {
		const ref = upstreamRef(issue.body ?? '');
		return ref && isAllowedOwner(ref.repo.owner, owners)
			? [`${formatRepo(ref.repo)}#${ref.number}`.toLowerCase()]
			: [];
	});
}

const SAFE = /^([\w.-]+)\/([\w.-]+)$/;

/** Duplicate comments per `owner/repo#n` of up to `MAX_REPORTS` open reports: one GraphQL call. */
export async function duplicateCounts(
	ctx: GhContext,
	reports: readonly DashIssue[],
): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	const wanted = reports
		.filter((issue) => issue.labels.includes('consumer-report'))
		.slice(0, MAX_REPORTS)
		.flatMap((issue) => {
			const match = SAFE.exec(issue.repo);
			return match?.[1] && match[2]
				? [{ issue, owner: match[1], name: match[2] }]
				: [];
		});
	if (wanted.length === 0) return counts;
	const fields = wanted.map(
		({ issue, owner, name }, i) =>
			`r${i}:repository(owner:"${owner}",name:"${name}"){issue(number:${issue.number}){comments(last:50){nodes{body authorAssociation}}}}`,
	);
	const data = await graphql(ctx, ['-f', `query=query{${fields.join('\n')}}`]);
	for (const [i, { issue }] of wanted.entries()) {
		const nodes = obj(obj(obj(data[`r${i}`])['issue'])['comments'])['nodes'];
		const list = Array.isArray(nodes) ? nodes : [];
		counts.set(
			`${issue.repo}#${issue.number}`.toLowerCase(),
			list.filter(
				(node) =>
					DUPLICATE.test(text(obj(node)['body'])) &&
					TRUSTED.has(text(obj(node)['authorAssociation'])),
			).length,
		);
	}
	return counts;
}
