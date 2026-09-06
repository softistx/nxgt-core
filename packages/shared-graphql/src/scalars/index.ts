import { ANY_SCALAR } from './any';
import { CUSTOM_SCALARS } from './custom';
import { UPLOAD_SCALAR } from './upload';

export const SCALAR_RESOLVERS = {
	...UPLOAD_SCALAR,
	...ANY_SCALAR,
	...CUSTOM_SCALARS,
};
