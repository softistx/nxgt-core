/**
 * Refreshing a repository's cache entry with two GraphQL calls through `gh`:
 * one for its open issues and its `upstream`-labelled tracking issues, one
 * (aliased, one field per tracking issue) for the state, labels and last
 * comment of each upstream issue. A repository without tracking issues costs
 * one call. A rate-limit refusal is `gh()`'s: it throws `RateLimitedError` and
 * stores the pause.
 */

import { cachePath, writeEntry } from './cache';
import type { CliContext, ExitCode } from './cli-context';
import { EXIT } from './cli-context';
import type { GhContext } from './github';
import { GhError, gh, RateLimitedError } from './github';
import { clearStamps, setStamp } from './refresh-state';
import { upstreamRef } from './refs';
import {
	allowedOwners,
	formatRepo,
	isAllowedOwner,
	type RepoId,
	repoOfDirectory,
} from './repo-id';

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
}

export interface Snapshot {
	readonly repo: string;
	readonly issues: readonly PackageIssue[];
	readonly tracking: readonly TrackingIssue[];
	/** Open issues of the repository, tracking issues apart (the list is capped). */
	readonly total?: number;
}

const LISTING = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
issues(states:OPEN,first:50,orderBy:{field:CREATED_AT,direction:ASC}){totalCount nodes{number title createdAt updatedAt labels(first:10){nodes{name}}}}
reports:issues(states:OPEN,labels:["consumer-report"],first:10,orderBy:{field:CREATED_AT,direction:ASC}){nodes{number title createdAt updatedAt labels(first:10){nodes{name}}}}
tracking:issues(states:OPEN,labels:["upstream"],first:30){totalCount nodes{number title body}}}}`;

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};
const nodes = (value: unknown): Obj[] => {
	const list = obj(value)['nodes'];
	return Array.isArray(list) ? list.map(obj) : [];
};
const text = (value: unknown): string =>
	typeof value === 'string' ? value : '';
const labelNames = (value: unknown): string[] =>
	nodes(obj(value)['labels']).map((node) => text(node['name']));

async function graphql(ctx: GhContext, args: readonly string[]): Promise<Obj> {
	const out = await gh(ctx, ['api', 'graphql', ...args], undefined, {
		partial: true,
	});
	let parsed: Obj;
	try {
		parsed = obj(JSON.parse(out));
	} catch {
		throw new GhError(
			args,
			0,
			`unparseable JSON from gh: ${out.slice(0, 100)}`,
		);
	}
	if (!parsed['data']) throw new GhError(args, 0, 'GraphQL answered no data');
	return obj(parsed['data']);
}

/** The upstream lookups: `u<i>` aliases; every part is validated by `upstreamRef`'s pattern. */
export function upstreamQuery(
	refs: readonly { repo: RepoId; number: number }[],
): string {
	const fields = refs.map(
		(ref, i) =>
			`u${i}:repository(owner:"${ref.repo.owner}",name:"${ref.repo.repo}"){issue(number:${ref.number}){state labels(first:10){nodes{name}} comments(last:1){nodes{body}}}}`,
	);
	return `query{${fields.join('\n')}}`;
}

/** Two GraphQL calls; the snapshot is also written to the cache. */
export async function refreshRepo(
	ctx: GhContext,
	id: RepoId,
	owners: readonly string[],
): Promise<Snapshot> {
	const data = await graphql(ctx, [
		'-f',
		`query=${LISTING}`,
		'-f',
		`owner=${id.owner}`,
		'-f',
		`name=${id.repo}`,
	]);
	if (!data['repository']) {
		throw new GhError([], 0, `${formatRepo(id)} is not visible to gh`);
	}
	const repository = obj(data['repository']);
	const seen = new Set<number>();
	const issues = [
		...nodes(repository['issues']),
		...nodes(repository['reports']),
	]
		.map((node) => ({
			number: Number(node['number']),
			title: text(node['title']),
			labels: labelNames(node),
			createdAt: text(node['createdAt']),
			updatedAt: text(node['updatedAt']),
		}))
		.filter((issue) => {
			if (seen.has(issue.number)) return false;
			seen.add(issue.number);
			return !issue.labels.includes('upstream');
		});
	const wanted = nodes(repository['tracking']).flatMap((node) => {
		const ref = upstreamRef(text(node['body']));
		// Only repositories the plugin may touch are queried.
		return ref && isAllowedOwner(ref.repo.owner, owners) ? [{ node, ref }] : [];
	});
	const upstream =
		wanted.length === 0
			? {}
			: await graphql(ctx, [
					'-f',
					`query=${upstreamQuery(wanted.map((entry) => entry.ref))}`,
				]);
	const tracking = wanted.map(({ node, ref }, i): TrackingIssue => {
		const issue = obj(obj(upstream[`u${i}`])['issue']);
		const state = text(issue['state']);
		const comment = text(nodes(issue['comments'])[0]?.['body']);
		return {
			number: Number(node['number']),
			title: text(node['title']),
			upstream: `${formatRepo(ref.repo)}#${ref.number}`,
			...(state === 'OPEN' || state === 'CLOSED'
				? { upstreamState: state }
				: {}),
			upstreamLabels: labelNames(issue),
			...(comment ? { lastComment: comment.slice(0, 300) } : {}),
		};
	});
	const total =
		Number(obj(repository['issues'])['totalCount']) -
		Number(obj(repository['tracking'])['totalCount'] ?? 0);
	const snapshot: Snapshot = {
		repo: formatRepo(id),
		issues,
		tracking,
		...(Number.isFinite(total) && total >= 0 ? { total } : {}),
	};
	writeEntry(cachePath(ctx.home, id), snapshot, ctx.now());
	clearStamps(ctx.home, id);
	return snapshot;
}

/** `issues.ts refresh`: the cache entry of the directory's repository. */
export async function refreshCommand(ctx: CliContext): Promise<ExitCode> {
	const id = repoOfDirectory(ctx.cwd);
	const owners = allowedOwners(ctx.env);
	if (!id || !isAllowedOwner(id.owner, owners)) {
		ctx.err('refresh: the origin is not a repository of an allowed owner.');
		return EXIT.refusedGate;
	}
	try {
		const snapshot = await refreshRepo(ctx, id, owners);
		ctx.out(
			`${snapshot.repo}: ${snapshot.issues.length} open issue(s), ${snapshot.tracking.length} tracking issue(s) cached`,
		);
		return EXIT.ok;
	} catch (error) {
		setStamp(ctx.home, id, 'failed', ctx.now());
		ctx.err(error instanceof Error ? error.message : String(error));
		return error instanceof RateLimitedError ? EXIT.rateLimited : EXIT.failed;
	}
}
