import { describe, expect, test } from 'bun:test';
import { browserSubpathsOf, subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@nxgt/shared-hono', {
				'.': {},
				'./mcp': {},
				'./package.json': './package.json',
			}),
		).toEqual(['@nxgt/shared-hono', '@nxgt/shared-hono/mcp']);
	});
});

describe('browserSubpathsOf', () => {
	test('names only the subpaths whose condition map has a browser entry', () => {
		expect(
			browserSubpathsOf('@nxgt/i18n', {
				'.': { browser: './dist/browser.js', import: './dist/index.js' },
				'./hono': { import: './dist/hono.js' },
				'./plain': './dist/plain.js',
				'./package.json': { browser: './package.json' },
			}),
		).toEqual(['@nxgt/i18n']);
	});
});
