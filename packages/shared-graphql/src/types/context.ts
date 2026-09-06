import type { TokenPrincipal } from '@nxgt/shared';

/**
 * `TokenPrincipal`, not `Principal`. This package is nxgt-federation's alone —
 * sellix-monorepo has no GraphQL — and what its server puts in the context is
 * a decoded JWT: `sub`, `uid`, `scope`. `Principal` is the gateway-header
 * shape, and the two survived the merge under different names precisely
 * because they are different models of the caller. See the duplication table
 * in AGENTS.md.
 */
import type { YogaInitialContext } from 'graphql-yoga';

export interface GraphQLBaseContext extends YogaInitialContext {
	user?: TokenPrincipal;
	token?: string;
}

export type ServerContext = {
	request: Request;
};

export type PrincipalContext = {
	user?: TokenPrincipal;
	token?: string;
};
