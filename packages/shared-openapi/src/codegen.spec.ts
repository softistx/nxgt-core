/**
 * The codegen helpers against the real tools and the TypeScript installed:
 * 6 in the lockfile, where they generate; 7 in CI's "Newest peers" job, which
 * installs the newest end of `^6.0.3 || ^7.0.0`, where they refuse with the
 * fix. `typescript-7.spec.ts` covers 7 offline, in every run.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineHeyApiConfig, generateOpenapiTS } from './index';

const hasCompilerApi = 'factory' in (await import('typescript')).default;

const SPEC = `openapi: 3.1.0
info:
  title: Probe
  version: 1.0.0
paths: {}
components:
  schemas:
    Upload:
      type: object
      required: [at, file]
      properties:
        at:
          type: string
          format: date-time
        file:
          type: string
          format: binary
        deleted:
          type: string
          format: date-time
          nullable: true
        name:
          type: string
`;

let root = '';

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'shared-openapi-codegen-'));
	await Bun.write(join(root, 'openapi.yaml'), SPEC);
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe.skipIf(!hasCompilerApi)('with TypeScript 6', () => {
	test('generateOpenapiTS maps date-time to Date and binary to File', async () => {
		const outputFolder = join(root, 'generated');
		await generateOpenapiTS(Bun.pathToFileURL(join(root, 'openapi.yaml')), {
			outputFolder,
			outputFileName: 'api.d.ts',
		});
		const output = await Bun.file(join(outputFolder, 'api.d.ts')).text();
		expect(output).toMatch(/at\?: Date;/);
		expect(output).toMatch(/file\?: File;/);
		expect(output).toMatch(/deleted\?: Date \| null;/);
		expect(output).toMatch(/name\?: string;/);
	});

	test('defineHeyApiConfig fills the defaults, and hands them to the configurer', async () => {
		const defaults = {
			input: './openapi/api-docs.yaml',
			output: 'src/generated/openapi-ts',
			plugins: ['zod'],
		} as const;
		expect(await defineHeyApiConfig()).toEqual(defaults);
		let seen: unknown;
		const configured = await defineHeyApiConfig((config) => {
			seen = config;
			return { input: 'x.yaml', output: 'out' };
		});
		expect(seen).toEqual(defaults);
		expect(configured).toEqual({ input: 'x.yaml', output: 'out' });
	});
});

describe.skipIf(hasCompilerApi)('with TypeScript 7', () => {
	test('generateOpenapiTS refuses with the fix', async () => {
		await expect(
			generateOpenapiTS(join(root, 'openapi.yaml'), {
				outputFolder: join(root, 'generated'),
			}),
		).rejects.toThrow(/install typescript@\^6\.0\.3/);
	});

	test('defineHeyApiConfig refuses with the fix', async () => {
		await expect(defineHeyApiConfig()).rejects.toThrow(
			/install typescript@\^6\.0\.3/,
		);
	});
});
