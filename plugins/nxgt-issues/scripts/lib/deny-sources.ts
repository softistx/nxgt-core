/**
 * Where a filing's deny-list comes from, gathered once per filing: the
 * application's repository (`origin`), its package and workspace names, the
 * working directory, every private repository of the allowed owners (`gh repo
 * list`, cached 24 h, the stale copy used when gh fails, and no filing at all
 * when there is neither), `git config user.name` / `user.email`, the hostname,
 * the home folder, and the application's own domains and extra terms from the
 * configuration (see `readDenyConfig`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import type { CliContext } from './cli-context';
import { buildDenyList, type DenyList, unique } from './deny';
import { privateRepos } from './github-issues';
import { allowedOwners, formatRepo, repoOfDirectory } from './repo-id';
import { manifestsOf, repoRoot } from './workspaces';

export const PRIVATE_REPOS_TTL_MS = 24 * 60 * 60 * 1000;

export interface DenyConfig {
	/** The application's own domains, such as `api.example-app.io`. */
	readonly appDomains: readonly string[];
	/** Any other term that must never appear in a filing. */
	readonly denyTerms: readonly string[];
}

const list = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string')
		: [];

function readConfigFile(path: string): DenyConfig {
	try {
		const data = JSON.parse(readFileSync(path, 'utf8')) as Record<
			string,
			unknown
		>;
		return {
			appDomains: list(data['appDomains']),
			denyTerms: list(data['denyTerms']),
		};
	} catch {
		return { appDomains: [], denyTerms: [] };
	}
}

const csv = (value: string | undefined): string[] =>
	(value ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);

/**
 * The union of `NXGT_ISSUES_APP_DOMAINS` / `NXGT_ISSUES_DENY_TERMS`
 * (comma-separated), `<nxgt-issues home>/config.json` (every application) and
 * `<repository root>/.nxgt-issues.json` (this one), each file
 * `{ "appDomains": [...], "denyTerms": [...] }`.
 */
export function readDenyConfig(ctx: CliContext, root?: string): DenyConfig {
	const files = [
		readConfigFile(join(ctx.home, 'config.json')),
		...(root ? [readConfigFile(join(root, '.nxgt-issues.json'))] : []),
	];
	return {
		appDomains: unique([
			...csv(ctx.env['NXGT_ISSUES_APP_DOMAINS']),
			...files.flatMap((f) => f.appDomains),
		]),
		denyTerms: unique([
			...csv(ctx.env['NXGT_ISSUES_DENY_TERMS']),
			...files.flatMap((f) => f.denyTerms),
		]),
	};
}

export class DenyListIncomplete extends Error {}

/** Private repositories of every allowed owner, from the cache when fresh. */
export async function privateRepoNames(ctx: CliContext): Promise<string[]> {
	const path = join(ctx.home, 'cache', 'private-repos.json');
	const owners = allowedOwners(ctx.env);
	const cached = readEntry<Record<string, string[]>>(
		path,
		ctx.now(),
		PRIVATE_REPOS_TTL_MS,
	);
	const covers = owners.every((o) => Array.isArray(cached?.data[o]));
	if (cached?.fresh && covers)
		return owners.flatMap((o) => cached.data[o] ?? []);
	try {
		const byOwner: Record<string, string[]> = {};
		for (const owner of owners) byOwner[owner] = await privateRepos(ctx, owner);
		writeEntry(path, byOwner, ctx.now());
		return Object.values(byOwner).flat();
	} catch (error) {
		if (cached && covers) return owners.flatMap((o) => cached.data[o] ?? []);
		const why = error instanceof Error ? error.message : String(error);
		throw new DenyListIncomplete(
			`cannot list the owners' private repositories (${why.slice(0, 200)}); a filing without them could leak a private name`,
		);
	}
}

async function gitConfig(ctx: CliContext, key: string) {
	try {
		const result = await ctx.runner.run(['git', 'config', '--get', key], {
			cwd: ctx.cwd,
		});
		return result.code === 0 ? result.stdout.trim() || undefined : undefined;
	} catch {
		return undefined;
	}
}

/** The deny-list of one filing; throws `DenyListIncomplete` when it cannot be whole. */
export async function filingDenyList(ctx: CliContext): Promise<DenyList> {
	const root = repoRoot(ctx.cwd);
	const app = repoOfDirectory(ctx.cwd);
	const config = readDenyConfig(ctx, root);
	const built = buildDenyList({
		appRepo: app ? formatRepo(app) : undefined,
		appPackages: root
			? manifestsOf(root)
					.map((m) => m.name)
					.filter((n): n is string => !!n)
			: [],
		cwd: ctx.cwd,
		privateRepos: await privateRepoNames(ctx),
		gitName: await gitConfig(ctx, 'user.name'),
		gitEmail: await gitConfig(ctx, 'user.email'),
		hostname: ctx.hostname,
		appDomains: config.appDomains,
		home: ctx.homeDir,
	});
	return Object.freeze({
		terms: unique([...built.terms, ...config.denyTerms]),
		distinctive: built.distinctive,
	});
}
