/**
 * Which npm packages a repository publishes, for the dashboard's grouping:
 * the name in its root `package.json` and in every `packages/<dir>/package.json`,
 * all repositories in ONE aliased GraphQL call. Cached 24 hours per repository
 * in `<home>/cache/repo-packages.json`, and only for a repository GitHub
 * actually answered for. A missing file or directory means the repository
 * publishes nothing (cached as empty); a repository GitHub did not answer for
 * (a null alias: the partial error of a missing or invisible repository) and a
 * call that failed (5xx, 403, timeout, rate limit) leave it uncached: the call
 * throws on a failure, and the caller shows repository names instead.
 */

import { join } from 'node:path';
import { readEntry, writeEntry } from './cache';
import type { GhContext } from './github';
import { graphql } from './refresh';

export const PACKAGES_TTL_MS = 24 * 60 * 60 * 1000;

interface Stored {
	readonly at: number;
	readonly packages: readonly string[];
}
type Store = Record<string, Stored>;
type Obj = Record<string, unknown>;

const SAFE = /^([\w.-]+)\/([\w.-]+)$/;
const path = (home: string) => join(home, 'cache', 'repo-packages.json');
const obj = (value: unknown): Obj =>
	value && typeof value === 'object' ? (value as Obj) : {};

const SELECTION = `root:object(expression:"HEAD:package.json"){...on Blob{text}}
dirs:object(expression:"HEAD:packages"){...on Tree{entries{name object{...on Tree{entries{name object{...on Blob{text}}}}}}}}`;

function nameOf(manifest: unknown): string | undefined {
	const text = obj(manifest)['text'];
	if (typeof text !== 'string') return undefined;
	try {
		const name = (JSON.parse(text) as { name?: unknown }).name;
		return typeof name === 'string' && name ? name : undefined;
	} catch {
		return undefined;
	}
}

function namesIn(repository: Obj): string[] {
	const entries = obj(repository['dirs'])['entries'];
	const manifests = (Array.isArray(entries) ? entries : []).flatMap(
		(entry: unknown) => {
			const inner = obj(obj(entry)['object'])['entries'];
			return (Array.isArray(inner) ? inner : [])
				.map(obj)
				.filter((file) => file['name'] === 'package.json')
				.map((file) => file['object']);
		},
	);
	const names = [repository['root'], ...manifests].flatMap((manifest) => {
		const name = nameOf(manifest);
		return name ? [name] : [];
	});
	return [...new Set(names)];
}

/** Package names per `owner/repo`; a repository GitHub gave no answer for is absent. Throws on a failed call. */
export async function repoPackages(
	ctx: GhContext,
	repos: readonly string[],
): Promise<Map<string, readonly string[]>> {
	const now = ctx.now();
	const store: Store = {
		...readEntry<Store>(path(ctx.home), now, Number.POSITIVE_INFINITY)?.data,
	};
	const result = new Map<string, readonly string[]>();
	const wanted: { repo: string; owner: string; name: string }[] = [];
	for (const repo of new Set(repos)) {
		const cached = store[repo.toLowerCase()];
		const match = SAFE.exec(repo);
		if (cached && now - cached.at >= 0 && now - cached.at < PACKAGES_TTL_MS) {
			result.set(repo, cached.packages);
		} else if (match?.[1] && match[2]) {
			wanted.push({ repo, owner: match[1], name: match[2] });
		}
	}
	if (wanted.length === 0) return result;
	const fields = wanted.map(
		({ owner, name }, i) =>
			`p${i}:repository(owner:"${owner}",name:"${name}"){${SELECTION}}`,
	);
	const data = await graphql(ctx, ['-f', `query=query{${fields.join('\n')}}`]);
	for (const [i, { repo }] of wanted.entries()) {
		const repository = data[`p${i}`];
		if (!repository || typeof repository !== 'object') continue;
		const packages = namesIn(repository as Obj);
		store[repo.toLowerCase()] = { at: now, packages };
		result.set(repo, packages);
	}
	writeEntry(path(ctx.home), store, now);
	return result;
}
