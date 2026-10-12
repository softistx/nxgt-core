/**
 * The package where neither code generator is installed, offline.
 *
 * `@hey-api/openapi-ts` and `openapi-typescript` are optional peers: a
 * consumer that only `$ref`s the YAML installs neither. This builds that world
 * in a temporary folder outside the workspace — a `typescript` with a compiler
 * API, as 6 has, and no generator — copies `src/` beside it, and imports the
 * copy. Calling a helper must then say which optional peer to install, not
 * surface the runtime's bare "Cannot find package".
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const FILES: Record<string, string> = {
	'node_modules/typescript/package.json': JSON.stringify({
		name: 'typescript',
		version: '6.0.3',
		type: 'module',
		exports: './index.js',
	}),
	'node_modules/typescript/index.js': [
		"export const version = '6.0.3';",
		'export const factory = { createTypeReferenceNode: (name) => ({ name }) };',
		'export default { version, factory };',
	].join('\n'),
};

let root = '';
let shared: typeof import('./index');

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'shared-openapi-no-tools-'));
	for (const [path, content] of Object.entries(FILES)) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await Bun.write(join(root, path), content);
	}
	for (const file of new Bun.Glob('**/*.ts').scanSync(import.meta.dir)) {
		if (file.endsWith('.spec.ts')) continue;
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

describe('where neither code generator is installed', () => {
	test('generateOpenapiTS names openapi-typescript and how to install it', async () => {
		const run = shared.generateOpenapiTS('./openapi.yaml', {
			outputFolder: join(root, 'generated'),
		});
		await expect(run).rejects.toThrow(
			/generateOpenapiTS needs `openapi-typescript`, an optional peer of @nxgt\/shared-openapi.*bun add -d openapi-typescript/s,
		);
	});

	test('defineHeyApiConfig names @hey-api/openapi-ts and how to install it', async () => {
		await expect(shared.defineHeyApiConfig()).rejects.toThrow(
			/defineHeyApiConfig needs `@hey-api\/openapi-ts`, an optional peer of @nxgt\/shared-openapi.*bun add -d @hey-api\/openapi-ts/s,
		);
	});

	test('keeps the runtime error as the cause', async () => {
		const error = await shared.defineHeyApiConfig().catch((e: unknown) => e);
		expect((error as Error).cause).toMatchObject({
			code: 'ERR_MODULE_NOT_FOUND',
		});
	});
});
