import { join } from 'node:path';
import { buildSubgraphSchema as buildSubgraphSchemaBase } from '@apollo/subgraph';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { pruneSchema } from '@graphql-tools/utils';
import { printSchema } from 'graphql';

export const SHARED_SCHEMA_PATH = join(__dirname, './**/*.graphqls');

export function loadTypeDefs(...paths: string[]) {
	const typeDefs = mergeTypeDefs([
		...paths.flatMap((path) =>
			loadFilesSync(path, {
				recursive: true,
			}),
		),
	]);

	return typeDefs;
}

export function buildSubgraphSchema(
	modulesOrSdl: Parameters<typeof buildSubgraphSchemaBase>[0],
) {
	return pruneSchema(buildSubgraphSchemaBase(modulesOrSdl), {
		skipUnusedTypesPruning: false,
	});
}

/**
 * Utility function to generate a GraphQL schema file from the provided type definitions.
 * @param output - The path where the generated schema file should be saved.
 * @param paths - An array of glob patterns to locate the GraphQL type definition files.
 */
export async function generateSchema(output: string, ...paths: string[]) {
	await Bun.write(
		output,
		printSchema(buildSubgraphSchema(loadTypeDefs(...paths))),
	);
}
