/**
 * Which npm packages a repository publishes, for the dashboard's grouping:
 * the name in its root `package.json` and in each `packages/<dir>/package.json`
 * (at most `MAX_DIRS` directories). Read through `gh api`, cached 24 hours per
 * repository in `<home>/cache/repo-packages.json`, and bounded: a run makes at
 * most `MAX_CALLS` lookups, and a repository left unread simply shows under its
 * own name. A repository without a `package.json` is cached as empty. A rate
 * limit propagates; any other failure leaves that repository uncached.
 */

import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import { type GhContext, GhError, gh } from './github';

export const PACKAGES_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CALLS = 30;
export const MAX_DIRS = 6;

interface Stored {
	readonly at: number;
	readonly packages: readonly string[];
}
type Store = Record<string, Stored>;

const SAFE = /^[\w.-]+\/[\w.-]+$/;
const DIR = /^[\w.-]+$/;
const RAW = ['-H', 'Accept: application/vnd.github.raw+json'];

const path = (home: string) => join(home, 'cache', 'repo-packages.json');

function nameOf(raw: string): string | undefined {
	try {
		const name = (JSON.parse(raw) as { name?: unknown }).name;
		return typeof name === 'string' && name ? name : undefined;
	} catch {
		return undefined;
	}
}

async function lookup(
	ctx: GhContext,
	repo: string,
	budget: { left: number },
): Promise<string[] | undefined> {
	const read = async (file: string): Promise<string | undefined> => {
		if (budget.left <= 0) throw new RangeError('budget');
		budget.left--;
		try {
			return await gh(ctx, ['api', ...RAW, `repos/${repo}/contents/${file}`]);
		} catch (error) {
			if (error instanceof GhError) return undefined;
			throw error;
		}
	};
	const names: string[] = [];
	const root = await read('package.json');
	const rootName = root === undefined ? undefined : nameOf(root);
	if (rootName) names.push(rootName);
	const listing = await read('packages');
	let dirs: string[] = [];
	try {
		const parsed: unknown = JSON.parse(listing ?? '[]');
		dirs = (Array.isArray(parsed) ? parsed : [])
			.map((entry: { name?: unknown; type?: unknown }) =>
				entry?.type === 'dir' && typeof entry.name === 'string'
					? entry.name
					: '',
			)
			.filter((name) => DIR.test(name))
			.slice(0, MAX_DIRS);
	} catch {}
	for (const dir of dirs) {
		const manifest = await read(`packages/${dir}/package.json`);
		const name = manifest === undefined ? undefined : nameOf(manifest);
		if (name && !names.includes(name)) names.push(name);
	}
	return names;
}

/** Package names per `owner/repo`; a repository that could not be read is absent. */
export async function repoPackages(
	ctx: GhContext,
	repos: readonly string[],
): Promise<Map<string, readonly string[]>> {
	const now = ctx.now();
	const store: Store = {
		...readEntry<Store>(path(ctx.home), now, Number.POSITIVE_INFINITY)?.data,
	};
	const budget = { left: MAX_CALLS };
	let changed = false;
	const result = new Map<string, readonly string[]>();
	for (const repo of repos) {
		const key = repo.toLowerCase();
		const cached = store[key];
		if (cached && now - cached.at >= 0 && now - cached.at < PACKAGES_TTL_MS) {
			result.set(repo, cached.packages);
			continue;
		}
		if (!SAFE.test(repo)) continue;
		try {
			const packages = await lookup(ctx, repo, budget);
			if (packages) {
				store[key] = { at: now, packages };
				result.set(repo, packages);
				changed = true;
			}
		} catch (error) {
			if (error instanceof RangeError) break;
			throw error;
		}
	}
	if (changed) writeEntry(path(ctx.home), store, now);
	return result;
}
