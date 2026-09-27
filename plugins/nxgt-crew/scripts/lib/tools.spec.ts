import { describe, expect, test } from 'bun:test';
import { claimsFromMktemp, editedPath } from './tools';

describe('editedPath', () => {
	test('reads file_path and notebook_path of the writing tools', () => {
		expect(editedPath('Edit', { file_path: '/a.ts' })).toBe('/a.ts');
		expect(editedPath('Write', { file_path: '/b.ts' })).toBe('/b.ts');
		expect(editedPath('NotebookEdit', { notebook_path: '/n.ipynb' })).toBe(
			'/n.ipynb',
		);
	});

	test('ignores other tools and relative paths', () => {
		expect(editedPath('Read', { file_path: '/a.ts' })).toBeUndefined();
		expect(editedPath('Edit', { file_path: 'a.ts' })).toBeUndefined();
		expect(editedPath(undefined, undefined)).toBeUndefined();
	});
});

describe('claimsFromMktemp', () => {
	const roots = ['/tmp/'];
	test('claims the folders a mktemp command printed', () => {
		expect(
			claimsFromMktemp(
				{ command: 'd=$(mktemp -d); echo "$d"' },
				{ stdout: '/tmp/tmp.AbC\n' },
				roots,
			),
		).toEqual(['/tmp/tmp.AbC']);
	});

	test('ignores commands without mktemp, the root itself, and text', () => {
		expect(
			claimsFromMktemp({ command: 'ls /tmp' }, { stdout: '/tmp/x\n' }, roots),
		).toEqual([]);
		expect(
			claimsFromMktemp(
				{ command: 'mktemp -d' },
				{ stdout: '/tmp/\nhello world\n/etc/x\n' },
				roots,
			),
		).toEqual([]);
		expect(
			claimsFromMktemp({ command: 'mktemp -d' }, 'not an object', roots),
		).toEqual([]);
	});
});
