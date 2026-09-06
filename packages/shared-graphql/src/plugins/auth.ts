import type { Plugin } from 'graphql-yoga';
import type { GraphQLBaseContext } from '../types';

export function useAuth(): Plugin<GraphQLBaseContext> {
	return {
		onContextBuilding: async ({ context, extendContext }) => {
			extendContext({
				user: context.params.extensions?.user,
				token: context.params.extensions?.token,
			});
		},
	};
}
