/**
 * What counts as the public surface of a published package: the files a
 * consumer reads, imports or receives. Pure — paths are relative to the
 * package directory, POSIX-separated — so the specs need no repository.
 */

/** Directories shipped as they are: a schema or a spec a consumer reads. */
const ASSET_DIRS = new Set(['graphql', 'openapi', 'schema']);

/** The `package.json` fields a consumer sees: what resolves, what ships, which peers. */
export const SURFACE_FIELDS = [
	'exports',
	'files',
	'peerDependencies',
	'peerDependenciesMeta',
] as const;

/** A spec, a test or a helper that only the tests load. */
export function isTestFile(path: string): boolean {
	const segments = path.split('/');
	if (segments.includes('__tests__') || segments.includes('__fixtures__'))
		return true;
	const base = segments[segments.length - 1] ?? '';
	return /\.(spec|test|fixtures|harness)\./.test(base);
}

export type SurfaceKind = 'surface' | 'package-json' | 'docs' | 'none';

/**
 * Classifies one changed file of a package. `package-json` means the answer
 * depends on which fields changed (`packageJsonSurfaceChanged`); `docs` (the
 * README or a page under docs/) is documentation, which closes a gap.
 */
export function classify(path: string): SurfaceKind {
	if (path === 'package.json') return 'package-json';
	const first = path.split('/')[0] ?? '';
	if (
		path.toLowerCase() === 'readme.md' ||
		(first === 'docs' && path.includes('/'))
	) {
		return 'docs';
	}
	if (first === 'src' || first === 'lib') {
		return path.includes('/') && !isTestFile(path) ? 'surface' : 'none';
	}
	if (ASSET_DIRS.has(first) && path.includes('/')) return 'surface';
	return 'none';
}

/** JSON with object keys sorted, so `{a, b}` and `{b, a}` compare equal. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
		);
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
	}
	return JSON.stringify(value) ?? 'undefined';
}

/**
 * Whether a `package.json` changed what a consumer sees. `base` is the parsed
 * version at the comparison point, `undefined` when the file is new there —
 * a new manifest is a new surface.
 */
export function packageJsonSurfaceChanged(
	base: Record<string, unknown> | undefined,
	current: Record<string, unknown>,
): boolean {
	if (!base) return true;
	return SURFACE_FIELDS.some(
		(field) => canonical(base[field]) !== canonical(current[field]),
	);
}

/** Folders whose `package.json` files are test data, not packages. */
const TEST_DATA_DIRS = new Set([
	'__tests__',
	'__fixtures__',
	'fixtures',
	'test',
]);

/**
 * Whether a directory's `package.json` is test data rather than a package:
 * it sits under a `__tests__/`, `__fixtures__/`, `fixtures/` or `test/`
 * folder (a package named `packages/test` is still one), or inside the `src/`
 * or `lib/` of an ancestor package. `isPackage` says whether a
 * repository-relative directory holds a package that owns its files — a
 * manifest without `workspaces`, so a root with `"workspaces": ["lib/*"]` does
 * not swallow its own workspace packages.
 */
export function ignoredManifestDir(
	dir: string,
	isPackage: (dir: string) => boolean,
): boolean {
	if (dir === '') return false;
	const segments = dir.split('/');
	return segments.some(
		(segment, i) =>
			(i < segments.length - 1 && TEST_DATA_DIRS.has(segment)) ||
			((segment === 'src' || segment === 'lib') &&
				isPackage(segments.slice(0, i).join('/'))),
	);
}
