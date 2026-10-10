/**
 * The gaps the Stop hook reports: a published package whose public surface
 * changed while its documentation (the README or a
 * page under docs/) did not. Pure — the repository is reached through
 * the `PackageLookup` passed in — so the specs need no git.
 */

import { classify } from './surface';

export interface PackageInfo {
	/** The package directory, relative to the repository root ('' for the root). */
	readonly dir: string;
	readonly name: string;
	readonly hasDocs: boolean;
}

export interface PackageLookup {
	/** The nearest package holding this repository-relative file, published or not. */
	packageOf(
		file: string,
	): { readonly info: PackageInfo; readonly published: boolean } | undefined;
	/** Whether the package's `package.json` changed `exports`, `files` or a peer. */
	manifestSurfaceChanged(info: PackageInfo): boolean;
}

export interface Gap {
	readonly pkg: PackageInfo;
	/** The changed public files, relative to the package, sorted. */
	readonly files: readonly string[];
}

const relativeTo = (dir: string, file: string) =>
	dir === '' ? file : file.slice(dir.length + 1);

/** The published packages holding at least one changed file. */
export function publishedPackages(
	changed: readonly string[],
	lookup: PackageLookup,
): Map<PackageInfo['dir'], { info: PackageInfo; files: string[] }> {
	const packages = new Map<string, { info: PackageInfo; files: string[] }>();
	for (const file of changed) {
		const found = lookup.packageOf(file);
		if (!found?.published) continue;
		const entry = packages.get(found.info.dir) ?? {
			info: found.info,
			files: [],
		};
		entry.files.push(relativeTo(found.info.dir, file));
		packages.set(found.info.dir, entry);
	}
	return packages;
}

/** Each published package whose surface changed with no README or docs/ change. */
export function findGaps(
	changed: readonly string[],
	lookup: PackageLookup,
): Gap[] {
	const gaps: Gap[] = [];
	for (const { info, files } of publishedPackages(changed, lookup).values()) {
		if (files.some((file) => classify(file) === 'docs')) continue;
		const surface = files.filter((file) => {
			const kind = classify(file);
			return (
				kind === 'surface' ||
				(kind === 'package-json' && lookup.manifestSurfaceChanged(info))
			);
		});
		if (surface.length > 0)
			gaps.push({ pkg: info, files: [...surface].sort() });
	}
	return gaps.sort((a, b) =>
		a.pkg.dir < b.pkg.dir ? -1 : a.pkg.dir > b.pkg.dir ? 1 : 0,
	);
}

/** The key a package is recorded under in the session state. */
export const gapKey = (gap: Gap): string => gap.pkg.dir || '.';

/**
 * The gaps of packages not reported yet in this session. A package already
 * reported stays quiet even when more of its files change: the gate asks once
 * per package, so a long session is not interrupted on every edit.
 */
export function newlyGapped(
	gaps: readonly Gap[],
	reported: readonly string[],
): Gap[] {
	const seen = new Set(reported);
	return gaps.filter((gap) => !seen.has(gapKey(gap)));
}
