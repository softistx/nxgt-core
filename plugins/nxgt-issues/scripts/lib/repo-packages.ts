/**
 * Which npm packages a repository publishes, for the dashboard's grouping.
 * Names only, never file bodies: call A (aliased, 25 repositories a call)
 * reads each root `package.json` and the entry names of `packages/`; call B
 * (aliased, at most 100 objects a call) reads exactly
 * `packages/<dir>/package.json` for each directory. Reading whole trees cost
 * megabytes and timed out on big monorepos.
 *
 * Cached 24 hours per repository in `<home>/cache/repo-packages.json`, only for
 * a repository GitHub answered for without an error under its alias. A missing
 * file or directory means it publishes nothing (cached as empty). A repository
 * whose lookup failed (a 5xx, a timeout, an error under its alias) is cached as
 * `failed` for an hour, so one slow repository cannot fail every run, and is
 * absent from the result; a null repository (missing or invisible) is simply
 * not cached. A rate limit throws.
 */

import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import { type GhContext, GhError } from './github';
import { graphqlPartial } from './graphql-partial';
import { obj } from './json';
import { SAFE_REPO } from './repo-id';

export const PACKAGES_TTL_MS = 24 * 60 * 60 * 1000;
export const FAILED_TTL_MS = 60 * 60 * 1000;
export const REPOS_PER_CALL = 25;
export const OBJECTS_PER_CALL = 100;

interface Stored {
	readonly at: number;
	readonly packages: readonly string[];
	readonly failed?: true;
}
type Store = Record<string, Stored>;
interface Target {
	readonly repo: string;
	readonly owner: string;
	readonly name: string;
}

const DIR = /^[\w.-]+$/;
const path = (home: string) => join(home, 'cache', 'repo-packages.json');
const repository = (alias: string, t: Target, body: string) =>
	`${alias}:repository(owner:"${t.owner}",name:"${t.name}"){${body}}`;
const BLOB = '...on Blob{text}';

/** The `name` of a package.json blob; undefined for a missing blob, bad JSON or a non-string name. */
function nameOf(blob: unknown): string | undefined {
	const text = obj(blob)['text'];
	if (typeof text !== 'string') return undefined;
	try {
		const name = (JSON.parse(text) as { name?: unknown } | null)?.name;
		return typeof name === 'string' && name ? name : undefined;
	} catch {
		return undefined;
	}
}

/** Directory names of a `packages/` tree that are safe to put in a query. */
function directories(tree: unknown): string[] {
	const entries = obj(tree)['entries'];
	return (Array.isArray(entries) ? entries.map(obj) : []).flatMap((entry) =>
		entry['type'] === 'tree' &&
		typeof entry['name'] === 'string' &&
		DIR.test(entry['name'])
			? [entry['name']]
			: [],
	);
}

interface Found {
	readonly root: string | undefined;
	readonly dirs: string[];
}

/** Call A for one chunk: root names and directory names; failed repositories are returned apart. */
async function names(ctx: GhContext, chunk: readonly Target[]) {
	const found = new Map<string, Found>();
	const failed = new Set<string>();
	const query = chunk
		.map((t, i) =>
			repository(
				`p${i}`,
				t,
				`root:object(expression:"HEAD:package.json"){${BLOB}} dirs:object(expression:"HEAD:packages"){...on Tree{entries{name type}}}`,
			),
		)
		.join('\n');
	try {
		const { data, errored } = await graphqlPartial(ctx, `query{${query}}`);
		for (const [i, t] of chunk.entries()) {
			const alias = obj(data[`p${i}`]);
			if (errored.has(`p${i}`)) failed.add(t.repo);
			else if (!data[`p${i}`]) continue;
			else
				found.set(t.repo, {
					root: nameOf(alias['root']),
					dirs: directories(alias['dirs']),
				});
		}
	} catch (error) {
		if (!(error instanceof GhError)) throw error;
		for (const t of chunk) failed.add(t.repo);
	}
	return { found, failed };
}

/** Call B for one batch of (repository, directory) pairs: the package name of each; repositories hit by an error are returned apart. */
async function manifests(
	ctx: GhContext,
	batch: readonly { target: Target; dir: string }[],
) {
	const found = new Map<number, string>();
	const failed = new Set<string>();
	const query = batch
		.map(({ target, dir }, i) =>
			repository(
				`b${i}`,
				target,
				`object(expression:"HEAD:packages/${dir}/package.json"){${BLOB}}`,
			),
		)
		.join('\n');
	try {
		const { data, errored } = await graphqlPartial(ctx, `query{${query}}`);
		for (const [i, { target }] of batch.entries()) {
			if (errored.has(`b${i}`)) failed.add(target.repo);
			const name = nameOf(obj(obj(data[`b${i}`])['object']));
			if (name !== undefined) found.set(i, name);
		}
	} catch (error) {
		if (!(error instanceof GhError)) throw error;
		for (const { target } of batch) failed.add(target.repo);
	}
	return { found, failed };
}

const chunks = <T>(list: readonly T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
		list.slice(i * size, (i + 1) * size),
	);

/** Package names per `owner/repo`; a repository that failed or got no answer is absent. Throws on a rate limit. */
export async function repoPackages(
	ctx: GhContext,
	repos: readonly string[],
): Promise<Map<string, readonly string[]>> {
	const now = ctx.now();
	const store: Store = {
		...readEntry<Store>(path(ctx.home), now, Number.POSITIVE_INFINITY)?.data,
	};
	const result = new Map<string, readonly string[]>();
	const wanted: Target[] = [];
	for (const repo of new Set(repos)) {
		const cached = store[repo.toLowerCase()];
		const age = cached ? now - cached.at : -1;
		const ttl = cached?.failed ? FAILED_TTL_MS : PACKAGES_TTL_MS;
		const match = SAFE_REPO.exec(repo);
		if (cached && age >= 0 && age < ttl) {
			if (!cached.failed) result.set(repo, cached.packages);
		} else if (match?.[1] && match[2]) {
			wanted.push({ repo, owner: match[1], name: match[2] });
		}
	}
	if (wanted.length === 0) return result;

	const failed = new Set<string>();
	const roots = new Map<string, Found>();
	for (const chunk of chunks(wanted, REPOS_PER_CALL)) {
		const a = await names(ctx, chunk);
		for (const [repo, found] of a.found) roots.set(repo, found);
		for (const repo of a.failed) failed.add(repo);
	}
	const pairs = wanted.flatMap((target) =>
		(roots.get(target.repo)?.dirs ?? []).map((dir) => ({ target, dir })),
	);
	const dirNames = new Map<string, string[]>();
	for (const batch of chunks(pairs, OBJECTS_PER_CALL)) {
		const b = await manifests(ctx, batch);
		for (const repo of b.failed) failed.add(repo);
		for (const [i, name] of b.found) {
			const repo = (batch[i] as { target: Target }).target.repo;
			dirNames.set(repo, [...(dirNames.get(repo) ?? []), name]);
		}
	}
	for (const target of wanted) {
		const key = target.repo.toLowerCase();
		const root = roots.get(target.repo);
		if (failed.has(target.repo)) {
			store[key] = { at: now, packages: [], failed: true };
		} else if (root) {
			const all = [root.root, ...(dirNames.get(target.repo) ?? [])].filter(
				(name): name is string => name !== undefined,
			);
			const packages = [...new Set(all)];
			store[key] = { at: now, packages };
			result.set(target.repo, packages);
		}
	}
	writeEntry(path(ctx.home), store, now);
	return result;
}
