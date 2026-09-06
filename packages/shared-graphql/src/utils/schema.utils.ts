import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSubgraphSchema as buildSubgraphSchemaBase } from '@apollo/subgraph';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { pruneSchema } from '@graphql-tools/utils';
import { printSchema } from 'graphql';

/**
 * The `.graphqls` this package ships live in `graphql/` at its root, so that
 * they survive `bun pm pack` — the bundle in `dist/` carries no assets. Their
 * directory is not at a fixed depth from this file: it is `src/utils` in the
 * workspace and `dist` in the published bundle, which Bun flattens. Walking up
 * to the nearest `package.json` finds the package root in both.
 */
function packageRoot() {
	let dir = dirname(fileURLToPath(import.meta.url));
	while (!existsSync(join(dir, 'package.json'))) {
		const parent = dirname(dir);
		if (parent === dir)
			throw new Error('@nxgt/shared-graphql: no package root');
		dir = parent;
	}
	return dir;
}

export const SHARED_SCHEMA_PATH = join(packageRoot(), 'graphql/**/*.graphqls');

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
