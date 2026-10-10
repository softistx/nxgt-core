import { describe, expect, test } from 'bun:test';
import { buildReason } from './reason';

const pkg = (dir: string) => ({ dir, name: '@x/p', hasDocs: false });

describe('buildReason', () => {
	test('a known root names the package by absolute path, the root package included', () => {
		const text = buildReason([
			{ root: '/r', pkg: pkg(''), files: ['src/a.ts'] },
			{ root: '/w', pkg: pkg('packages/p'), files: ['src/b.ts'] },
		]);
		expect(text).toContain('- @x/p (/r): public files changed — src/a.ts.');
		expect(text).toContain('Not changed: /r/README.md.');
		expect(text).toContain('Not changed: /w/packages/p/README.md.');
	});

	test('without a root the root package is "the repository root"', () => {
		expect(buildReason([{ pkg: pkg(''), files: ['src/a.ts'] }])).toContain(
			'(the repository root)',
		);
	});
});
