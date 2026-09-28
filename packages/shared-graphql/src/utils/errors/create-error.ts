import { GraphQLError, type GraphQLErrorOptions } from 'graphql';

export function createGraphQLError(
	message: string,
	options?: GraphQLErrorOptions,
): GraphQLError {
	return new GraphQLError(message, options);
}
