import type { ApolloServerPlugin } from '@apollo/server';
import type { Principal } from '@nxgt/shared';
import { logger } from '@nxgt/shared-logging';

export const extractJwtPlugin = {
	async requestDidStart({ request, contextValue }) {
		logger.info(
			`[${request.extensions?.subgraphName}] Extracting JWT from request extensions: ${request.extensions?.payload?.sub}`,
			request.extensions,
		);
		contextValue.jwt = {
			payload: request.extensions?.payload,
		};
	},
} satisfies ApolloServerPlugin<{
	jwt?: { payload: Principal };
}>;
