/**
 * Where a filing's deny-list comes from, gathered once per filing: the
 * application's repository (`origin`; without one, the checkout's root folder
 * and main checkout folder names), its package and workspace names, the
 * working directory, every private repository of the default and configured
 * owners (`gh repo
 * list`, cached 24 h, the stale copy used when gh fails, and no filing at all
 * when there is neither), `git config user.name` / `user.email`, the hostname,
 * the home folder, and the application's own domains and extra terms from the
 * configuration (see `readDenyConfig`). No domain configured and no explicit
 * `"appDomains": []` in the repository's `.nxgt-issues.json` refuses the
 * filing.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import type { CliContext } from './cli-context';
import { buildDenyList, type DenyList, unique } from './deny';
import { privateRepos } from './github-issues';
import {
	allowedOwners,
	DEFAULT_OWNERS,
	formatRepo,
	gitConfigPath,
	repoOfDirectory,
} from './repo-id';
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

/** Whether `<root>/.nxgt-issues.json` says, with `"appDomains": []`, that the app has no domain. */
export function declaresNoDomains(root: string | undefined): boolean {
	if (!root) return false;
	try {
		const data = JSON.parse(
			readFileSync(join(root, '.nxgt-issues.json'), 'utf8'),
		);
		const domains = (data as Record<string, unknown> | null)?.['appDomains'];
		return Array.isArray(domains) && domains.length === 0;
	} catch {
		return false;
	}
}

/** No configured domain and no explicit `appDomains: []`: the filing cannot be checked whole. */
function requireDomains(config: DenyConfig, root: string | undefined): void {
	if (config.appDomains.length > 0 || declaresNoDomains(root)) return;
	throw new DenyListIncomplete(
		'no application domain is configured; list them in .nxgt-issues.json at the repository root ({ "appDomains": ["example-app.com"] }), or write "appDomains": [] when the application has none',
	);
}

/**
 * Whose private repositories are denied: the default owners and the configured
 * ones. `NXGT_ISSUES_OWNERS` narrows who receives filings, never what is denied.
 */
export function denyOwners(env: Record<string, string | undefined>): string[] {
	const owners: string[] = [];
	for (const owner of [...DEFAULT_OWNERS, ...allowedOwners(env)]) {
		if (!owners.some((o) => o.toLowerCase() === owner.toLowerCase()))
			owners.push(owner);
	}
	return owners;
}

/** Private repositories of every allowed owner, from the cache when fresh. */
export async function privateRepoNames(ctx: CliContext): Promise<string[]> {
	const path = join(ctx.home, 'cache', 'private-repos.json');
	const owners = denyOwners(ctx.env);
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

/** `git config --get <key>`: exit 1 is unset; a spawn that throws or another code refuses. */
async function gitConfig(ctx: CliContext, key: string) {
	let result: Awaited<ReturnType<CliContext['runner']['run']>>;
	try {
		result = await ctx.runner.run(['git', 'config', '--get', key], {
			cwd: ctx.cwd,
		});
	} catch (error) {
		const why = error instanceof Error ? error.message : String(error);
		throw new DenyListIncomplete(
			`cannot read git config ${key} (${why.slice(0, 200)})`,
		);
	}
	if (result.code === 0) return result.stdout.trim() || undefined;
	if (result.code === 1) return undefined;
	throw new DenyListIncomplete(
		`git config ${key} failed (${result.code}): ${result.stderr.trim().slice(0, 200)}`,
	);
}

const folderName = (path: string | undefined): string | undefined =>
	path ? basename(path) || undefined : undefined;

/**
 * Without a GitHub origin the repository has no name to deny, so its folders
 * stand in: the checkout root, and the folder holding the git common dir (the
 * main checkout of a linked worktree).
 */
function folderTerms(cwd: string): string[] {
	const config = gitConfigPath(cwd);
	const common = config ? dirname(config) : undefined;
	return [
		folderName(repoRoot(cwd)),
		folderName(common ? dirname(common) : undefined),
	].filter((term): term is string => !!term);
}

/** The deny-list of one filing; throws `DenyListIncomplete` when it cannot be whole. */
export async function filingDenyList(ctx: CliContext): Promise<DenyList> {
	const root = repoRoot(ctx.cwd);
	const app = repoOfDirectory(ctx.cwd);
	const config = readDenyConfig(ctx, root);
	requireDomains(config, root);
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
	const folders = app ? [] : folderTerms(ctx.cwd);
	return Object.freeze({
		terms: unique([...built.terms, ...config.denyTerms, ...folders]),
		distinctive: built.distinctive,
	});
}
