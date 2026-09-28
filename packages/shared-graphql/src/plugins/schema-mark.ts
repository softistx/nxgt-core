import { GraphQLSchema } from 'graphql';

/**
 * A schema transform run twice wraps every resolver twice, and a Yoga plugin
 * that replaces the schema in `onSchemaChange` is called again with every
 * schema another plugin produces. So each transform marks what it returns in
 * the schema's `extensions` — which `mapSchema` carries over — and passes a
 * marked schema through untouched. Two transforms then settle, whatever
 * order their plugins run in.
 */
export function isMarked(schema: GraphQLSchema, mark: string): boolean {
	return schema.extensions?.[mark] === true;
}

export function withMark(schema: GraphQLSchema, mark: string): GraphQLSchema {
	const config = schema.toConfig();
	return new GraphQLSchema({
		...config,
		extensions: { ...config.extensions, [mark]: true },
	});
}
