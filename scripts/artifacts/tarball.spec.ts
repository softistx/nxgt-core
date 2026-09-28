import { describe, expect, test } from 'bun:test';
import { licenseProblems, TEST_CODE, testCodeProblems } from './tarball';

describe('licenseProblems', () => {
	test('wants MIT and a LICENSE in the tarball itself', () => {
		expect(
			licenseProblems({ name: 'x', license: 'MIT' }, ['package/LICENSE']),
		).toEqual([]);
		expect(licenseProblems({ name: 'x', license: 'ISC' }, [])).toEqual([
			'x: license is ISC, not MIT',
			'x: the tarball has no LICENSE',
		]);
	});
});

describe('testCodeProblems', () => {
	const x = { name: 'x' };

	test('refuses a spec or a test, emitted or not', () => {
		expect(
			testCodeProblems(x, [
				'package/src/audit/model.spec.ts',
				'package/dist/audit/model.spec.d.ts',
				'package/dist/env.test.js',
			]),
		).toEqual([
			'x: the tarball ships test code: src/audit/model.spec.ts',
			'x: the tarball ships test code: dist/audit/model.spec.d.ts',
			'x: the tarball ships test code: dist/env.test.js',
		]);
	});

	test('refuses a fixtures file with a dotted prefix, the one specs share', () => {
		expect(
			testCodeProblems(x, [
				'package/dist/migrations/runner.fixtures.d.ts',
				'package/src/mongo/connect.fixtures.ts',
			]),
		).toEqual([
			'x: the tarball ships test code: dist/migrations/runner.fixtures.d.ts',
			'x: the tarball ships test code: src/mongo/connect.fixtures.ts',
		]);
	});

	test('allows a plain fixtures file, and what every package ships', () => {
		expect(
			testCodeProblems(x, [
				'package/package.json',
				'package/LICENSE',
				'package/README.md',
				'package/dist/conformance/fixtures.d.ts',
				'package/dist/index.js',
			]),
		).toEqual([]);
	});

	test('refuses a snapshot, and reads a name, not a folder', () => {
		expect(TEST_CODE.test('src/__snapshots__/a.spec.ts.snap')).toBe(true);
		expect(TEST_CODE.test('dist/specimens/index.js')).toBe(false);
		expect(TEST_CODE.test('dist/a.spec/index.js')).toBe(false);
		expect(TEST_CODE.test('dist/fixtures/index.js')).toBe(false);
	});
});
