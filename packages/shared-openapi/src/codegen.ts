import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compilerApi } from './compiler-api';

export async function generateOpenapiTS(
	input: string | URL,
	{
		outputFolder,
		outputFileName,
	}: {
		outputFolder?: string;
		outputFileName?: string;
	} = {},
) {
	// Loaded here, not at module scope: see compiler-api.ts.
	const ts = await compilerApi('generateOpenapiTS');
	const {
		default: openapiTS,
		astToString,
		tsNullable,
	} = await import('openapi-typescript');
	const DATE = ts.factory.createTypeReferenceNode('Date');
	const FILE = ts.factory.createTypeReferenceNode('File');

	const ast = await openapiTS(input, {
		transform(schemaObject, _metadata) {
			if (schemaObject.format === 'date-time') {
				return {
					schema: schemaObject.nullable ? tsNullable([DATE]) : DATE,
					questionToken: true,
				};
			}
			if (schemaObject.format === 'binary') {
				return {
					schema: schemaObject.nullable ? tsNullable([FILE]) : FILE,
					questionToken: true,
				};
			}
			return undefined;
		},
	});

	let exists = false;
	const outputPath = outputFolder ?? './src/generated';
	try {
		await readdir(outputPath);
		exists = true;
	} catch {
		console.warn('Directory does not exist');
	}

	if (!exists) {
		await mkdir(outputPath, { recursive: true });
	}

	const output = Bun.file(resolve(outputPath, outputFileName ?? 'openapi.ts'));

	if (await output.exists()) {
		await output.delete();
	}

	const writer = output.writer();

	writer.write(astToString(ast));

	await writer.end();
}
