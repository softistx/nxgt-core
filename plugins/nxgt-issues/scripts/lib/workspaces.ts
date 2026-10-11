/**
 * The manifests of a repository: its root `package.json` and those of its
 * workspaces (`workspaces` as an array or `{ packages }`, each entry a folder
 * or a `folder/*` pattern). Read from disk, nothing spawned; a manifest that
 * does not parse is skipped.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface Manifest {
	readonly dir: string;
	readonly name?: string | undefined;
	readonly data: Readonly<Record<string, unknown>>;
}

function readManifest(dir: string): Manifest | undefined {
	try {
		const data: unknown = JSON.parse(
			readFileSync(join(dir, 'package.json'), 'utf8'),
		);
		if (!data || typeof data !== 'object') return undefined;
		const record = data as Record<string, unknown>;
		const name =
			typeof record['name'] === 'string' ? record['name'] : undefined;
		return { dir, name, data: record };
	} catch {
		return undefined;
	}
}

function patternsOf(data: Readonly<Record<string, unknown>>): string[] {
	const field = data['workspaces'];
	const list = Array.isArray(field)
		? field
		: field && typeof field === 'object'
			? (field as { packages?: unknown }).packages
			: undefined;
	return Array.isArray(list)
		? list.filter((p): p is string => typeof p === 'string')
		: [];
}

function expand(root: string, pattern: string): string[] {
	if (pattern.startsWith('!') || pattern.includes('..')) return [];
	if (!pattern.endsWith('/*')) return [join(root, pattern)];
	const parent = join(root, pattern.slice(0, -2));
	try {
		return readdirSync(parent, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(parent, entry.name));
	} catch {
		return [];
	}
}

/** The root manifest first, then each workspace's. */
export function manifestsOf(root: string): Manifest[] {
	const top = readManifest(root);
	if (!top) return [];
	const workspaces = patternsOf(top.data)
		.flatMap((pattern) => expand(root, pattern))
		.map(readManifest)
		.filter((m): m is Manifest => !!m);
	return [top, ...workspaces];
}

/** The nearest directory at or above `start` that holds `.git`. */
export function repoRoot(start: string): string | undefined {
	let dir = resolve(start);
	for (;;) {
		if (existsSync(join(dir, '.git'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

const DEPENDENCY_FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

/** Every dependency a manifest declares, by name, with its range. */
export function dependenciesOf(manifest: Manifest): Map<string, string> {
	const out = new Map<string, string>();
	for (const field of DEPENDENCY_FIELDS) {
		const deps = manifest.data[field];
		if (!deps || typeof deps !== 'object') continue;
		for (const [name, range] of Object.entries(deps)) {
			if (typeof range === 'string' && !out.has(name)) out.set(name, range);
		}
	}
	return out;
}
