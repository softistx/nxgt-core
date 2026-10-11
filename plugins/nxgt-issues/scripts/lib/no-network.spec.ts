import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Only runner.ts may spawn a process or reach the network. */
const FORBIDDEN: readonly [string, RegExp][] = [
	['Bun.spawn', /\bBun\.spawn(Sync)?\b/],
	['Bun Shell ($`)', /(?<=^|[\s(=,])\$`/m],
	['fetch(', /(?<![\w.])fetch\(/],
	['child_process', /child_process/],
];

const stripComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const libraryFiles = readdirSync(import.meta.dir).filter(
	(name) =>
		name.endsWith('.ts') &&
		!name.endsWith('.spec.ts') &&
		!name.endsWith('.fixtures.ts') &&
		name !== 'runner.ts',
);

describe('no process or network outside runner.ts', () => {
	test('the check sees the library', () => {
		expect(libraryFiles).toContain('scrub.ts');
		expect(libraryFiles).not.toContain('runner.ts');
	});

	test.each(libraryFiles)('%s', (name) => {
		const source = stripComments(
			readFileSync(join(import.meta.dir, name), 'utf8'),
		);
		for (const [label, pattern] of FORBIDDEN) {
			expect({ file: name, label, found: pattern.test(source) }).toEqual({
				file: name,
				label,
				found: false,
			});
		}
	});

	test('runner.ts is where they live', () => {
		const source = readFileSync(join(import.meta.dir, 'runner.ts'), 'utf8');
		expect(source).toMatch(/Bun\.spawn/);
		expect(source).toMatch(/fetch\(/);
	});
});

describe('the patterns themselves', () => {
	const hit = (label: string, code: string) =>
		FORBIDDEN.find(([name]) => name === label)?.[1].test(code);

	test('catch what they are meant to', () => {
		expect(hit('Bun.spawn', 'Bun.spawn(["x"])')).toBe(true);
		expect(hit('Bun Shell ($`)', 'await $`ls`')).toBe(true);
		expect(hit('fetch(', 'await fetch(url)')).toBe(true);
	});

	test('leave alone what they are not', () => {
		expect(hit('Bun Shell ($`)', 'new RegExp(`^a/?$`)')).toBe(false);
		expect(hit('fetch(', 'fetchJson(url)')).toBe(false);
		expect(hit('fetch(', 'runner.fetchJson(url)')).toBe(false);
	});
});
