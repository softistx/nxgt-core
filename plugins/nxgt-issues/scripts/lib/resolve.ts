/**
 * From a package name to the repository its issues go to, and whether filing
 * there is allowed. The `repository` field comes from the registry
 * (`/<pkg>/latest`, 2 s) and, when the registry has none or cannot be reached,
 * from the installed copy found by walking up `node_modules` from the working
 * directory. The gate then asks `gh api repos/o/r` (cached 24 h): the owner
 * must be allowed, issues on, the repository not archived; whether it is
 * private is recorded. Each refusal carries a hint for the user.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { cachePath, readEntry, writeEntry } from './cache';
import {
	type GhContext,
	GhError,
	RateLimitedError,
	type RepoFacts,
	repoFacts,
} from './github';
import {
	allowedOwners,
	formatRepo,
	isAllowedOwner,
	parseRemote,
	parseRepositoryField,
	type RepoId,
} from './repo-id';

export const REGISTRY_TIMEOUT_MS = 2000;
export const GATE_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRY = 'https://registry.npmjs.org';

export type RefusalReason =
	| 'invalid-name'
	| 'unknown-package'
	| 'no-repository-field'
	| 'not-owner'
	| 'not-found'
	| 'issues-disabled'
	| 'archived'
	| 'rate-limited'
	| 'unreachable';

export interface Resolved {
	readonly ok: true;
	readonly package: string;
	readonly repo: RepoId;
	readonly private: boolean;
	/** The version under `node_modules`, when installed. */
	readonly installed?: string | undefined;
	/** The registry's `latest`, when reachable. */
	readonly latest?: string | undefined;
}

export interface Refused {
	readonly ok: false;
	readonly package: string;
	readonly reason: RefusalReason;
	readonly hint: string;
	readonly repo?: RepoId | undefined;
}

export interface ResolveContext extends GhContext {
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;
}

const PACKAGE_NAME = /^(?:@[a-z0-9~-][\w.~-]*\/)?[a-z0-9~-][\w.~-]*$/i;

interface Manifest {
	readonly version?: string | undefined;
	readonly repository?: unknown;
}

const asManifest = (value: unknown): Manifest =>
	value && typeof value === 'object' ? (value as Manifest) : {};

async function fromRegistry(
	ctx: ResolveContext,
	pkg: string,
): Promise<Manifest | undefined> {
	try {
		const url = `${REGISTRY}/${pkg.replace('/', '%2F')}/latest`;
		return asManifest(await ctx.runner.fetchJson(url, REGISTRY_TIMEOUT_MS));
	} catch {
		return undefined;
	}
}

/** The installed `package.json` of `pkg`, walking up from `start`. */
export function fromNodeModules(
	start: string,
	pkg: string,
): Manifest | undefined {
	let dir = resolve(start);
	for (;;) {
		const manifest = join(dir, 'node_modules', pkg, 'package.json');
		if (existsSync(manifest)) {
			try {
				return asManifest(JSON.parse(readFileSync(manifest, 'utf8')));
			} catch {
				return undefined;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

const refuse = (
	pkg: string,
	reason: RefusalReason,
	hint: string,
	repo?: RepoId,
): Refused => ({ ok: false, package: pkg, reason, hint, repo });

const gatePath = (home: string, id: RepoId): string =>
	join(home, 'cache', 'gate', basename(cachePath(home, id)));

/** `gh api repos/o/r`, from the 24-hour cache when fresh. */
export async function gateFacts(
	ctx: GhContext,
	id: RepoId,
): Promise<RepoFacts> {
	const path = gatePath(ctx.home, id);
	const cached = readEntry<RepoFacts>(path, ctx.now(), GATE_TTL_MS);
	if (cached?.fresh) return cached.data;
	const facts = await repoFacts(ctx, id);
	writeEntry(path, facts, ctx.now());
	return facts;
}

function gateError(pkg: string, id: RepoId, error: unknown): Refused {
	const repo = formatRepo(id);
	if (error instanceof RateLimitedError) {
		return refuse(pkg, 'rate-limited', `${error.message} Try again then.`, id);
	}
	if (error instanceof GhError && /not found|HTTP 404/i.test(error.stderr)) {
		const hint = `gh cannot see ${repo}: renamed, deleted, or not visible to this token. File nothing.`;
		return refuse(pkg, 'not-found', hint, id);
	}
	const message = error instanceof Error ? error.message : String(error);
	const hint = `gh failed (${message.slice(0, 200)}). Check \`gh auth status\`; file nothing until it works.`;
	return refuse(pkg, 'unreachable', hint, id);
}

/** The owner check, then the cached `gh api` gate. */
export async function gate(
	ctx: ResolveContext,
	pkg: string,
	id: RepoId,
): Promise<Refused | { facts: RepoFacts; repo: RepoId }> {
	const owners = allowedOwners(ctx.env);
	const notOwner = (repo: RepoId) =>
		refuse(
			pkg,
			'not-owner',
			`${formatRepo(repo)} does not belong to an allowed owner (${owners.join(', ')}; NXGT_ISSUES_OWNERS). nxgt-issues files nothing there.`,
			repo,
		);
	if (!isAllowedOwner(id.owner, owners)) return notOwner(id);
	let facts: RepoFacts;
	try {
		facts = await gateFacts(ctx, id);
	} catch (error) {
		return gateError(pkg, id, error);
	}
	const repo = parseRemote(`https://github.com/${facts.fullName}`) ?? id;
	if (!isAllowedOwner(repo.owner, owners)) return notOwner(repo);
	if (facts.archived) {
		const hint = `${formatRepo(repo)} is archived: nothing will be fixed there. Keep the workaround, and consider dropping the dependency.`;
		return refuse(pkg, 'archived', hint, repo);
	}
	if (!facts.hasIssues) {
		const hint = `Issues are turned off on ${formatRepo(repo)}. Tell the user; ask the owner to turn them on or message the package's session.`;
		return refuse(pkg, 'issues-disabled', hint, repo);
	}
	return { facts, repo };
}

export async function resolvePackage(
	ctx: ResolveContext,
	pkg: string,
): Promise<Resolved | Refused> {
	if (!PACKAGE_NAME.test(pkg)) {
		return refuse(pkg, 'invalid-name', `"${pkg}" is not an npm package name.`);
	}
	const registry = await fromRegistry(ctx, pkg);
	const installed = fromNodeModules(ctx.cwd, pkg);
	const id =
		parseRepositoryField(registry?.repository) ??
		parseRepositoryField(installed?.repository);
	if (!id) {
		if (!registry && !installed) {
			const hint = `${pkg} is neither on the registry nor installed under node_modules from here. Check the name.`;
			return refuse(pkg, 'unknown-package', hint);
		}
		const hint = `${pkg} has no GitHub \`repository\` field in its package.json. Ask its session to add one; file nothing until then.`;
		return refuse(pkg, 'no-repository-field', hint);
	}
	const gated = await gate(ctx, pkg, id);
	if ('ok' in gated) return gated;
	return {
		ok: true,
		package: pkg,
		repo: gated.repo,
		private: gated.facts.private,
		installed: installed?.version,
		latest: registry?.version,
	};
}
