/**
 * Refreshing a repository's cache entry with two GraphQL calls through `gh`:
 * one for its open issues and its `upstream`-labelled tracking issues, one
 * (aliased, one field per tracking issue) for the state, labels and last
 * comment of each upstream issue. A repository without tracking issues costs
 * one call. A rate-limit refusal is `gh()`'s: it throws `RateLimitedError` and
 * stores the pause. An answer with errors is not cached as a full snapshot:
 * the listing refuses any error; an upstream issue GitHub could not read
 * (anything but `NOT_FOUND`) is marked unknown on its tracking entry, never
 * read as missing, and the rest is cached (fresh for two minutes only).
 */

import { cachePath, writeEntry } from './cache';
import { type GhContext, GhError } from './github';
import { graphqlPartial, refuseUntraceable } from './graphql-partial';
import { nodes, obj, text } from './json';
import { hasLabel, LABELS } from './labels';
import { clearStamps } from './refresh-state';
import { trackedPackage, upstreamRef } from './refs';
import { formatRepo, isAllowedOwner, type RepoId } from './repo-id';
import type {
	PackageIssue,
	Snapshot,
	TrackingIssue,
	UpstreamIssue,
} from './snapshot';

const REPORT = LABELS['consumer-report'].name;
const ISSUE_FIELDS =
	'number title createdAt updatedAt labels(first:20){nodes{name}}';
const LISTING = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
issues(states:OPEN,first:50,orderBy:{field:CREATED_AT,direction:ASC}){totalCount nodes{${ISSUE_FIELDS}}}
reports:issues(states:OPEN,labels:["${REPORT}"],first:10,orderBy:{field:CREATED_AT,direction:ASC}){nodes{${ISSUE_FIELDS}}}
tracking:issues(states:OPEN,labels:["${LABELS.upstream.name}"],first:100){totalCount nodes{number title body}}}}`;

/** The label names of a GraphQL issue, lower-cased once here (GitHub's names are case-insensitive). */
const labelNames = (value: unknown): string[] =>
	nodes(obj(value)['labels']).map((node) => text(node['name']).toLowerCase());

/** The upstream lookups: `u<i>` aliases; every part is validated by `upstreamRef`'s pattern. */
export function upstreamQuery(
	refs: readonly { repo: RepoId; number: number }[],
): string {
	const fields = refs.map(
		(ref, i) =>
			`u${i}:repository(owner:"${ref.repo.owner}",name:"${ref.repo.repo}"){issue(number:${ref.number}){state labels(first:20){nodes{name}} comments(last:1){nodes{body authorAssociation author{__typename login}}}}}`,
	);
	return `query{${fields.join('\n')}}`;
}

/**
 * State, labels and last comment of each upstream issue, one aliased GraphQL
 * call (none for no ref). The caller has checked the owner allowlist and the
 * 32-bit number cap (`upstreamRef` does both); an issue GitHub says is not
 * there (`NOT_FOUND`) comes back without a state. Any other error under an
 * alias marks that issue `unknown`: "could not read" is never "not found", and
 * the others are kept. An error naming no alias throws `GhError`.
 */
export async function fetchUpstream(
	ctx: GhContext,
	refs: readonly { repo: RepoId; number: number }[],
): Promise<UpstreamIssue[]> {
	if (refs.length === 0) return [];
	const result = await graphqlPartial(ctx, upstreamQuery(refs));
	refuseUntraceable(result, 'upstream issues');
	return refs.map((_, i): UpstreamIssue => {
		if (result.unknown.has(`u${i}`)) return { labels: [], unknown: true };
		const issue = obj(obj(result.data[`u${i}`])['issue']);
		const state = text(issue['state']);
		const last = nodes(issue['comments'])[0];
		const comment = text(last?.['body']).slice(0, 300);
		const by = text(last?.['authorAssociation']);
		const author = obj(last?.['author']);
		const login = text(author['login']);
		const type = text(author['__typename']);
		return {
			...(state === 'OPEN' || state === 'CLOSED' ? { state } : {}),
			labels: labelNames(issue),
			...(comment ? { lastComment: comment } : {}),
			...(comment && by ? { lastCommentBy: by } : {}),
			...(comment && login ? { lastCommentLogin: login } : {}),
			...(comment && type ? { lastCommentAuthorType: type } : {}),
		};
	});
}

/** One tracking issue of the listing joined with what its upstream issue says. */
function trackingEntry(
	node: Record<string, unknown>,
	ref: { repo: RepoId; number: number },
	issue: UpstreamIssue | undefined,
): TrackingIssue {
	const packageName = trackedPackage(text(node['body']));
	return {
		number: Number(node['number']),
		title: text(node['title']),
		upstream: `${formatRepo(ref.repo)}#${ref.number}`,
		...(packageName ? { packageName } : {}),
		...(issue?.state ? { upstreamState: issue.state } : {}),
		upstreamLabels: issue?.labels ?? [],
		...(issue?.unknown ? { upstreamUnknown: true as const } : {}),
		...(issue?.lastComment ? { lastComment: issue.lastComment } : {}),
		...(issue?.lastComment && issue.lastCommentBy
			? { lastCommentBy: issue.lastCommentBy }
			: {}),
		...(issue?.lastComment && issue.lastCommentLogin
			? { lastCommentLogin: issue.lastCommentLogin }
			: {}),
		...(issue?.lastComment && issue.lastCommentAuthorType
			? { lastCommentAuthorType: issue.lastCommentAuthorType }
			: {}),
	};
}

/** Two GraphQL calls; the snapshot is also written to the cache (a cache that cannot be written still gives the snapshot). */
export async function refreshRepo(
	ctx: GhContext,
	id: RepoId,
	owners: readonly string[],
): Promise<Snapshot> {
	const listing = await graphqlPartial(ctx, LISTING, {
		owner: id.owner,
		name: id.repo,
	});
	if (!listing.data['repository']) {
		throw new GhError([], 0, `${formatRepo(id)} is not visible to gh`);
	}
	// The whole listing sits under one alias: any error means it is incomplete.
	if (listing.unknown.size > 0) {
		throw new GhError(
			[],
			0,
			`${formatRepo(id)}: GitHub answered the listing with errors; nothing cached`,
		);
	}
	const repository = obj(listing.data['repository']);
	const seen = new Set<number>();
	const issues = [
		...nodes(repository['issues']),
		...nodes(repository['reports']),
	]
		.map(
			(node): PackageIssue => ({
				number: Number(node['number']),
				title: text(node['title']),
				labels: labelNames(node),
				createdAt: text(node['createdAt']),
				updatedAt: text(node['updatedAt']),
			}),
		)
		.filter((issue) => {
			if (seen.has(issue.number)) return false;
			seen.add(issue.number);
			return !hasLabel(issue.labels, 'upstream');
		});
	const wanted = nodes(repository['tracking']).flatMap((node) => {
		const ref = upstreamRef(text(node['body']));
		// Only repositories the plugin may touch are queried.
		return ref && isAllowedOwner(ref.repo.owner, owners) ? [{ node, ref }] : [];
	});
	const upstream = await fetchUpstream(
		ctx,
		wanted.map((entry) => entry.ref),
	);
	const total =
		Number(obj(repository['issues'])['totalCount']) -
		Number(obj(repository['tracking'])['totalCount'] ?? 0);
	const snapshot: Snapshot = {
		repo: formatRepo(id),
		issues,
		tracking: wanted.map(({ node, ref }, i) =>
			trackingEntry(node, ref, upstream[i]),
		),
		...(Number.isFinite(total) && total >= 0 ? { total } : {}),
	};
	try {
		writeEntry(cachePath(ctx.home, id), snapshot, ctx.now());
		clearStamps(ctx.home, id);
	} catch {
		// An unwritable home only costs the cache; the caller still has the snapshot.
	}
	return snapshot;
}
