import type { GraphQLScalarType } from 'graphql';
import { ANY_SCALAR } from './any';
import { CUSTOM_SCALARS } from './custom';
import { UPLOAD_SCALAR } from './upload';

export const SCALAR_RESOLVERS: Record<string, GraphQLScalarType> = {
	...UPLOAD_SCALAR,
	...ANY_SCALAR,
	...CUSTOM_SCALARS,
};
