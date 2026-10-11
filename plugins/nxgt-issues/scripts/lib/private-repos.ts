/**
 * The private repositories a filing must never name: every private repository
 * of the default owners, the configured owners (`NXGT_ISSUES_OWNERS`, which
 * also narrows who receives filings), `NXGT_ISSUES_DENY_OWNERS` (deny-list
 * only) and the organisations the token belongs to (`gh api user/orgs`).
 * Both lists are cached 24 h; when gh fails the cached copy is used for up to
 * 7 days, and past that, or without one, the filing is refused. A list that
 * comes back empty, or an owner that drops to nothing although the cache held
 * repositories, is a token without the `repo` scope or a lookup that went
 * wrong, never an answer: it refuses and is not cached. A cached copy that
 * is empty is no answer either: it is refetched, and refuses if gh cannot say.
 * The token needs the `read:org` scope to list its organisations;
 * `NXGT_ISSUES_DENY_SKIP_ORGS` leaves out one whose repositories cannot be
 * listed (SAML single sign-on, say).
 */

import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import type { CliContext } from './cli-context';
import { privateRepos, userOrgs } from './github-issues';
import { allowedOwners, DEFAULT_OWNERS } from './repo-id';

export class DenyListIncomplete extends Error {}

export const PRIVATE_REPOS_TTL_MS = 24 * 60 * 60 * 1000;
/** The oldest cached copy still used when gh fails. */
export const STALE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

const lowered = (value: string): string => value.toLowerCase();

const reason = (error: unknown): string =>
	(error instanceof Error ? error.message : String(error)).slice(0, 200);

const csv = (value: string | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

function distinct(owners: readonly string[]): string[] {
	const out: string[] = [];
	for (const owner of owners) {
		if (!out.some((o) => o.toLowerCase() === owner.toLowerCase())) {
			out.push(owner);
		}
	}
	return out;
}

/**
 * Whose private repositories are denied: the default owners, the configured
 * ones and `NXGT_ISSUES_DENY_OWNERS`. `NXGT_ISSUES_OWNERS` narrows who
 * receives filings, never what is denied.
 */
export function denyOwners(env: Record<string, string | undefined>): string[] {
	return distinct([
		...DEFAULT_OWNERS,
		...allowedOwners(env),
		...csv(env['NXGT_ISSUES_DENY_OWNERS']),
	]);
}

const usable = (entry: { ageMs: number } | undefined): boolean =>
	entry !== undefined && entry.ageMs <= STALE_LIMIT_MS;

/** The organisations of the token: cache when fresh, gh otherwise, a stale copy (7 days) when gh fails. */
async function tokenOrgs(ctx: CliContext): Promise<string[]> {
	const path = join(ctx.home, 'cache', 'deny-orgs.json');
	const cached = readEntry<unknown>(path, ctx.now(), PRIVATE_REPOS_TTL_MS);
	const known = Array.isArray(cached?.data)
		? (cached.data as string[])
		: undefined;
	const skip = csv(ctx.env['NXGT_ISSUES_DENY_SKIP_ORGS']).map(lowered);
	const kept = (orgs: string[]) =>
		orgs.filter((o) => !skip.includes(o.toLowerCase()));
	if (cached?.fresh && known) return kept(known);
	try {
		const orgs = await userOrgs(ctx);
		if (orgs.length === 0 && (known?.length ?? 0) > 0) {
			throw new DenyListIncomplete(
				`gh listed no organisation although ${known?.length} were cached; the token may lack the read:org scope`,
			);
		}
		writeEntry(path, orgs, ctx.now());
		return kept(orgs);
	} catch (error) {
		if (error instanceof DenyListIncomplete) throw error;
		if (cached && known && usable(cached)) return kept(known);
		throw new DenyListIncomplete(
			`cannot list the token's organisations (${reason(error)}); a filing without their private repositories could leak a private name (the token needs the read:org scope)`,
		);
	}
}

type ByOwner = Record<string, string[]>;

/** Refuses a result that cannot be whole: nothing at all, or an owner that lost every repository the cache knew. */
function assertWhole(byOwner: ByOwner, before: ByOwner): void {
	for (const [owner, names] of Object.entries(byOwner)) {
		const known = before[owner]?.length ?? 0;
		if (names.length === 0 && known > 0) {
			throw new DenyListIncomplete(
				`gh listed no private repository of ${owner} although ${known} were cached; the token may have lost its repo scope (delete cache/private-repos.json if they were all removed)`,
			);
		}
	}
	if (Object.values(byOwner).every((names) => names.length === 0)) {
		throw new DenyListIncomplete(
			'gh listed no private repository for any owner; the token may lack the repo scope',
		);
	}
}

/** Private repositories of every deny owner and of the token's organisations. */
export async function privateRepoNames(ctx: CliContext): Promise<string[]> {
	const path = join(ctx.home, 'cache', 'private-repos.json');
	const owners = distinct([...denyOwners(ctx.env), ...(await tokenOrgs(ctx))]);
	const cached = readEntry<ByOwner>(path, ctx.now(), PRIVATE_REPOS_TTL_MS);
	const table: ByOwner =
		cached?.data && typeof cached.data === 'object' ? cached.data : {};
	const covers = owners.every((o) => Array.isArray(table[o]));
	const fromCache = () => owners.flatMap((o) => table[o] ?? []);
	// An empty cached list is no answer: refetch it, or refuse.
	const whole = covers && fromCache().length > 0;
	if (cached?.fresh && whole) return fromCache();
	const byOwner: ByOwner = {};
	try {
		for (const owner of owners) byOwner[owner] = await privateRepos(ctx, owner);
	} catch (error) {
		if (cached && whole && usable(cached)) return fromCache();
		throw new DenyListIncomplete(
			`cannot list the owners' private repositories (${reason(error)}); a filing without them could leak a private name`,
		);
	}
	assertWhole(byOwner, table);
	writeEntry(path, byOwner, ctx.now());
	return Object.values(byOwner).flat();
}
