import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

const DATE = ts.factory.createTypeReferenceNode(
	ts.factory.createIdentifier('Date'),
);
const FILE = ts.factory.createTypeReferenceNode(
	ts.factory.createIdentifier('File'),
);
const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull());

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
	const ast = await openapiTS(input, {
		transform(schemaObject, _metadata) {
			if (schemaObject.format === 'date-time') {
				return {
					schema: schemaObject.nullable
						? ts.factory.createUnionTypeNode([DATE, NULL])
						: DATE,
					questionToken: true,
				};
			}
			if (schemaObject.format === 'binary') {
				return {
					schema: schemaObject.nullable
						? ts.factory.createUnionTypeNode([FILE, NULL])
						: FILE,
					questionToken: true,
				};
			}
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

	writer.end();
}
