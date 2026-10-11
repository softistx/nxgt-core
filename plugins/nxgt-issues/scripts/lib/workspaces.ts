/**
 * The manifests of a repository: its root `package.json` and those of its
 * workspaces (`workspaces` as an array or `{ packages }`, each entry a folder
 * or a `folder/*` pattern), and the installed copy of a dependency under
 * `node_modules`. Read from disk, nothing spawned; a manifest that does not
 * parse is skipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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

/** A workspace pattern that cannot be expanded to folders (it leaves the repository, or the file that lists it is unreadable). */
export class UnexpandableWorkspace extends Error {}

/** The `packages` of `pnpm-workspace.yaml`; a file that does not parse is unexpandable in strict mode. */
function pnpmPatterns(root: string, strict: boolean): string[] {
	let text: string;
	try {
		text = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
	} catch {
		return [];
	}
	try {
		const data = Bun.YAML.parse(text) as { packages?: unknown } | null;
		return Array.isArray(data?.packages)
			? data.packages.filter((p): p is string => typeof p === 'string')
			: [];
	} catch {
		if (strict) {
			throw new UnexpandableWorkspace(
				'pnpm-workspace.yaml does not parse, so its workspaces are unknown',
			);
		}
		return [];
	}
}

/** The folders a pattern matches (those that hold a `package.json`); `!` patterns exclude nothing, so the list only ever errs wide. */
function expand(root: string, pattern: string, strict: boolean): string[] {
	if (pattern.startsWith('!')) return [];
	if (pattern.split(/[\\/]/).includes('..') || isAbsolute(pattern)) {
		if (strict) {
			throw new UnexpandableWorkspace(
				`the workspace pattern "${pattern}" leaves the repository`,
			);
		}
		return [];
	}
	const folder = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
	const glob = new Bun.Glob(`${folder}/package.json`);
	return [...glob.scanSync({ cwd: root, onlyFiles: true })]
		.filter((path) => !path.split(/[\\/]/).includes('node_modules'))
		.map((path) => join(root, dirname(path)))
		.filter((dir) => dir !== root)
		.sort();
}

/** The root manifest first, then each workspace's (`package.json` `workspaces` and `pnpm-workspace.yaml`). */
export function manifestsOf(
	root: string,
	options: { readonly strict?: boolean } = {},
): Manifest[] {
	const strict = options.strict === true;
	const top = readManifest(root);
	if (!top) return [];
	const patterns = [...patternsOf(top.data), ...pnpmPatterns(root, strict)];
	const dirs = new Set(
		patterns.flatMap((pattern) => expand(root, pattern, strict)),
	);
	const workspaces = [...dirs]
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

/** The fields of a package manifest the resolver reads. */
export interface PackageManifest {
	readonly version?: string | undefined;
	readonly repository?: unknown;
	readonly dependencies?: unknown;
	readonly peerDependencies?: unknown;
	readonly optionalDependencies?: unknown;
}

export const asPackageManifest = (value: unknown): PackageManifest =>
	value && typeof value === 'object' ? (value as PackageManifest) : {};

/** The installed `package.json` of `pkg`, walking up from `start`. */
export function fromNodeModules(
	start: string,
	pkg: string,
): PackageManifest | undefined {
	let dir = resolve(start);
	for (;;) {
		const manifest = join(dir, 'node_modules', pkg, 'package.json');
		if (existsSync(manifest)) {
			try {
				return asPackageManifest(JSON.parse(readFileSync(manifest, 'utf8')));
			} catch {
				return undefined;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/**
 * The packages an installed `pkg` declares (dependencies, peer and optional
 * dependencies), read from its local `package.json`: installed from npm, they
 * are public whatever their repository.
 */
export function declaredDependencies(start: string, pkg: string): string[] {
	const manifest = fromNodeModules(start, pkg);
	if (!manifest) return [];
	return [
		manifest.dependencies,
		manifest.peerDependencies,
		manifest.optionalDependencies,
	].flatMap((field) =>
		field && typeof field === 'object' ? Object.keys(field) : [],
	);
}
