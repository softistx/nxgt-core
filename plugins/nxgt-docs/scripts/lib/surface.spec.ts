import { describe, expect, test } from 'bun:test';
import {
	classify,
	ignoredManifestDir,
	isTestFile,
	packageJsonSurfaceChanged,
} from './surface';

describe('classify', () => {
	test('src/ and lib/ are the surface, specs and tests are not', () => {
		expect(classify('src/index.ts')).toBe('surface');
		expect(classify('lib/deep/a.js')).toBe('surface');
		expect(classify('src/index.spec.ts')).toBe('none');
		expect(classify('src/a.test.tsx')).toBe('none');
		expect(classify('src/__tests__/a.ts')).toBe('none');
		expect(classify('src/__fixtures__/a.ts')).toBe('none');
		expect(classify('src/a.fixtures.ts')).toBe('none');
		expect(classify('src/hooks.harness.ts')).toBe('none');
	});

	test('shipped asset directories are the surface', () => {
		for (const dir of ['graphql', 'openapi', 'schema']) {
			expect(classify(`${dir}/x.md`)).toBe('surface');
		}
	});

	test('the README and docs/ pages are documentation', () => {
		expect(classify('README.md')).toBe('docs');
		expect(classify('readme.md')).toBe('docs');
		expect(classify('Readme.MD')).toBe('docs');
		expect(classify('docs/guide/a.md')).toBe('docs');
		expect(classify('docs')).toBe('none');
		expect(classify('src/README.md')).toBe('surface');
	});

	test('package.json depends on its fields; anything else is not the surface', () => {
		expect(classify('package.json')).toBe('package-json');
		expect(classify('scripts/build.ts')).toBe('none');
		expect(classify('test/a.ts')).toBe('none');
		expect(classify('src')).toBe('none');
		expect(classify('CHANGELOG.md')).toBe('none');
	});

	test('isTestFile matches the base name only', () => {
		expect(isTestFile('src/spec.helpers/a.ts')).toBe(false);
		expect(isTestFile('src/a.spec.ts')).toBe(true);
	});
});

describe('packageJsonSurfaceChanged', () => {
	const base = {
		name: 'x',
		version: '1.0.0',
		exports: { '.': './dist/index.js', './a': './dist/a.js' },
		files: ['dist'],
		peerDependencies: { b: '^1' },
	};

	test('a version or script change is not the surface', () => {
		expect(
			packageJsonSurfaceChanged(base, {
				...base,
				version: '1.1.0',
				scripts: { t: 'x' },
			}),
		).toBe(false);
	});

	test('key order does not matter', () => {
		expect(
			packageJsonSurfaceChanged(base, {
				...base,
				exports: { './a': './dist/a.js', '.': './dist/index.js' },
			}),
		).toBe(false);
	});

	test('exports, files and peers do', () => {
		expect(
			packageJsonSurfaceChanged(base, {
				...base,
				exports: { '.': './dist/index.js' },
			}),
		).toBe(true);
		expect(
			packageJsonSurfaceChanged(base, { ...base, files: ['dist', 'docs'] }),
		).toBe(true);
		expect(
			packageJsonSurfaceChanged(base, {
				...base,
				peerDependencies: { b: '^2' },
			}),
		).toBe(true);
		expect(
			packageJsonSurfaceChanged(base, {
				...base,
				peerDependenciesMeta: { b: { optional: true } },
			}),
		).toBe(true);
	});

	test('a new manifest is a new surface', () => {
		expect(packageJsonSurfaceChanged(undefined, base)).toBe(true);
	});
});

describe('ignoredManifestDir', () => {
	const packages = new Set(['', 'packages/a']);
	const isPackage = (dir: string) => packages.has(dir);

	test('test-data folders hold no package', () => {
		for (const dir of [
			'packages/a/__tests__/pkg',
			'packages/a/__fixtures__/pkg',
			'packages/a/fixtures/pkg',
			'packages/a/test/fixtures/pkg',
		]) {
			expect(ignoredManifestDir(dir, isPackage)).toBe(true);
		}
	});

	test("a manifest inside an ancestor package's src/ or lib/ is no package", () => {
		expect(ignoredManifestDir('packages/a/src/sample', isPackage)).toBe(true);
		expect(ignoredManifestDir('packages/a/lib/x/y', isPackage)).toBe(true);
	});

	test('workspace packages and the root are packages', () => {
		expect(ignoredManifestDir('', isPackage)).toBe(false);
		expect(ignoredManifestDir('packages/a', isPackage)).toBe(false);
		expect(ignoredManifestDir('packages/b', isPackage)).toBe(false);
		expect(ignoredManifestDir('packages/b/src/x', isPackage)).toBe(false);
	});
});
