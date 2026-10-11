/**
 * The package where `typescript` resolves to TypeScript 7, offline.
 *
 * TypeScript 7's npm package exports no compiler API: its `.` is
 * `lib/version.cjs`, which holds `version` and `versionMajorMinor` and nothing
 * else (measured on 7.0.2). `openapi-typescript` 7.13 and
 * `@hey-api/openapi-ts` 0.99 both read the compiler API at module scope, so
 * under 7 importing either throws. This builds that world in a temporary
 * folder outside the workspace — a `typescript` shaped like 7.0.2's, and the
 * two tools reduced to what they do at module scope — copies `src/` beside
 * it, and imports the copy, which resolves all three from there.
 *
 * `codegen.spec.ts` runs the real tools against the TypeScript installed.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const FILES: Record<string, string> = {
	'node_modules/typescript/package.json': JSON.stringify({
		name: 'typescript',
		version: '7.0.2',
		type: 'module',
		exports: {
			'./package.json': './package.json',
			'.': './lib/version.cjs',
		},
	}),
	'node_modules/typescript/lib/version.cjs': [
		'const { version } = require("../package.json");',
		'exports.version = version;',
		'exports.versionMajorMinor = "7.0";',
	].join('\n'),
	'node_modules/openapi-typescript/package.json': JSON.stringify({
		name: 'openapi-typescript',
		version: '7.13.0',
		type: 'module',
		exports: './index.js',
	}),
	// As dist/lib/ts.mjs does at module scope.
	'node_modules/openapi-typescript/index.js': [
		"import ts from 'typescript';",
		'const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());',
		'export default async function openapiTS() { return [NULL]; }',
		'export function astToString() { return ""; }',
	].join('\n'),
	'node_modules/@hey-api/openapi-ts/package.json': JSON.stringify({
		name: '@hey-api/openapi-ts',
		version: '0.99.0',
		type: 'module',
		exports: './index.js',
	}),
	// As its dist/init-*.mjs does at module scope.
	'node_modules/@hey-api/openapi-ts/index.js': [
		"import ts from 'typescript';",
		'const ANY = ts.SyntaxKind.AnyKeyword;',
		'export async function defineConfig(config) {',
		"\treturn typeof config === 'function' ? await config() : { ...config, ANY };",
		'}',
	].join('\n'),
};

let root = '';
let shared: typeof import('./index');

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'shared-openapi-ts7-'));
	for (const [path, content] of Object.entries(FILES)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await Bun.write(join(root, path), content);
	}
	for (const file of await readdir(import.meta.dir)) {
		if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
		await Bun.write(
			join(root, 'src', file),
			Bun.file(join(import.meta.dir, file)),
		);
	}
	shared = await import(join(root, 'src', 'index.ts'));
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe('where typescript resolves to 7', () => {
	test('importing the package does not throw', () => {
		expect(typeof shared.generateOpenapiTS).toBe('function');
		expect(typeof shared.defineHeyApiConfig).toBe('function');
	});

	test('generateOpenapiTS fails naming the TypeScript found and the fix', async () => {
		const run = shared.generateOpenapiTS('./openapi.yaml', {
			outputFolder: join(root, 'generated'),
		});
		await expect(run).rejects.toThrow(
			/generateOpenapiTS needs TypeScript's compiler API.*TypeScript 7\.0\.2.*typescript@\^6\.0\.3/s,
		);
	});

	test('defineHeyApiConfig fails naming the TypeScript found and the fix', async () => {
		await expect(shared.defineHeyApiConfig()).rejects.toThrow(
			/defineHeyApiConfig needs TypeScript's compiler API.*TypeScript 7\.0\.2.*typescript@\^6\.0\.3/s,
		);
	});
});
