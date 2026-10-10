import { describe, expect, test } from 'bun:test';
import {
	findGaps,
	gapKey,
	newlyGapped,
	type PackageInfo,
	type PackageLookup,
} from './gaps';

const pkg = (dir: string, hasDocs = false): PackageInfo => ({
	dir,
	name: `@x/${dir || 'root'}`,
	hasDocs,
});

/** Root is private; packages/a and packages/b are published; packages/p is private. */
function lookup(manifestChanged = false): PackageLookup {
	const packages: Record<string, { info: PackageInfo; published: boolean }> = {
		'packages/a': { info: pkg('packages/a', true), published: true },
		'packages/b': { info: pkg('packages/b'), published: true },
		'packages/p': { info: pkg('packages/p'), published: false },
		'': { info: pkg(''), published: false },
	};
	return {
		packageOf(file) {
			const dir = Object.keys(packages).find(
				(d) => d !== '' && file.startsWith(`${d}/`),
			);
			return packages[dir ?? ''];
		},
		manifestSurfaceChanged: () => manifestChanged,
	};
}

describe('findGaps', () => {
	test('a src change without the README is a gap', () => {
		expect(
			findGaps(['packages/a/src/b.ts', 'packages/a/src/a.ts'], lookup()),
		).toEqual([
			{ pkg: pkg('packages/a', true), files: ['src/a.ts', 'src/b.ts'] },
		]);
	});

	test('the README changed with it closes the gap', () => {
		expect(
			findGaps(['packages/a/src/a.ts', 'packages/a/README.md'], lookup()),
		).toEqual([]);
	});

	test('a docs/ page changed with it closes the gap too', () => {
		expect(
			findGaps(['packages/a/src/a.ts', 'packages/a/docs/guide/a.md'], lookup()),
		).toEqual([]);
	});

	test('a docs-only change is no gap', () => {
		expect(findGaps(['packages/b/docs/a.md'], lookup())).toEqual([]);
	});

	test('private packages, the private root and specs never count', () => {
		expect(
			findGaps(
				['packages/p/src/a.ts', 'scripts/x.ts', 'packages/b/src/a.spec.ts'],
				lookup(),
			),
		).toEqual([]);
	});

	test('package.json counts only when its surface fields changed', () => {
		expect(findGaps(['packages/b/package.json'], lookup(false))).toEqual([]);
		expect(findGaps(['packages/b/package.json'], lookup(true))).toEqual([
			{ pkg: pkg('packages/b'), files: ['package.json'] },
		]);
	});

	test('a lower-case readme.md closes the gap', () => {
		expect(
			findGaps(['packages/a/src/a.ts', 'packages/a/readme.md'], lookup()),
		).toEqual([]);
	});
});

describe('newlyGapped', () => {
	test('keeps only the packages not reported yet, whatever their files', () => {
		const gaps = findGaps(
			[
				'packages/b/src/x.ts',
				'packages/b/src/y.ts',
				'packages/a/schema/s.graphql',
			],
			lookup(),
		);
		expect(gaps.map(gapKey)).toEqual(['packages/a', 'packages/b']);
		expect(newlyGapped(gaps, ['packages/b']).map(gapKey)).toEqual([
			'packages/a',
		]);
		expect(newlyGapped(gaps, ['packages/a', 'packages/b'])).toEqual([]);
		expect(newlyGapped(gaps, [])).toEqual(gaps);
	});

	test('the root package is keyed as "."', () => {
		expect(gapKey({ pkg: pkg(''), files: ['src/a.ts'] })).toBe('.');
	});
});
