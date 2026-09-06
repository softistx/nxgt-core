import type { Principal } from '@nxgt/shared';
import type { YogaInitialContext } from 'graphql-yoga';

export interface GraphQLBaseContext extends YogaInitialContext {
	user?: Principal;
	token?: string;
}

export type ServerContext = {
	request: Request;
};

export type PrincipalContext = {
	user?: Principal;
	token?: string;
};
